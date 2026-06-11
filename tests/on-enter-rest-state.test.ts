import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine, OnEnterObserver } from "../src/index.js";
import type { MutexInterface } from "../src/index.js";

class CountingMutex implements MutexInterface {
  acquireCount = 0;
  private acquired = false;
  acquireLock(): boolean {
    this.acquireCount++;
    if (this.acquired) return false;
    this.acquired = true;
    return true;
  }
  releaseLock(): boolean {
    this.acquired = false;
    return true;
  }
  isAcquired(): boolean {
    return this.acquired;
  }
  isLocked(): boolean {
    return this.acquired;
  }
}

describe("OnEnterObserver and automatic follow-on transitions", () => {
  it("fires onEnter for the state the machine comes to rest in", async () => {
    // a --evt--> b; b declares onEnter (b --onEnter--> d)
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("d")
      .addTransition("a", "b", { event: "evt" })
      .addTransition("b", "d", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new OnEnterObserver());

    await sm.triggerEvent("evt");
    // Let the chained onEnter op drain: checkTransitions queues behind it.
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("d");
  });

  it("skips onEnter for a state passed through by an automatic transition", async () => {
    // a --evt--> b; b --auto--> c; b declares onEnter (b --onEnter--> d).
    // The machine never rests in b, so b's onEnter must not fire.
    // On unfixed code, b's stale onEnter op runs in state c (no onEnter there),
    // a WrongEventForStateError is silently swallowed, and the final state is
    // coincidentally still c. The ifStateName guard makes the skip explicit.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addState("d")
      .addTransition("a", "b", { event: "evt" })
      .addTransition("b", "c") // automatic
      .addTransition("b", "d", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new OnEnterObserver());

    await sm.triggerEvent("evt");
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("does not double-fire onEnter when a passed-through state and the rest state both declare it", async () => {
    // a --evt--> b (declares onEnter: b --onEnter--> b2); b --auto--> c (declares onEnter: c --onEnter--> c2)
    // On UNFIXED code: both onEnter ops are enqueued. b's stale op runs in state c
    // and fires c->c2 (resolveEvent uses currentState). c's real op then runs in c2
    // which has no onEnter, so WrongEventForStateError is silently swallowed.
    // fired ends up ["c->c2"] — coincidentally matching the expected value — BUT
    // the machine has consumed c's "rest" transition via a stale op, not the real one.
    //
    // To expose the double-fire symptom reliably, c2 also declares onEnter (c2->c3).
    // On UNFIXED: b's stale fires c->c2 (enqueueing c2's onEnter), then c's real op
    //   fires c2->c3 (wrong! c's real op should have fired c->c2, not c2->c3).
    //   fired = ["c->c2", "c2->c3"].
    // On FIXED: b's op skipped (ifStateName="b", but machine is in c). c's real op
    //   fires c->c2. c2's own onEnter fires c2->c3.
    //   fired = ["c->c2", "c2->c3"].
    //
    // The fired arrays match, but the FINAL STATE differs only if c3 has onEnter too.
    // Rather than chasing deeper chains, we verify: (1) final state is c2 (only one
    // onEnter chain runs), and (2) b2 is NEVER reached (b's onEnter must not fire).
    const fired: string[] = [];
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("b2")
      .addState("c")
      .addState("c2")
      .addTransition("a", "b", { event: "evt" })
      .addTransition("b", "c") // automatic — machine passes through b
      .addTransition("b", "b2", { event: "onEnter" })
      .addTransition("c", "c2", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new OnEnterObserver());
    sm.attachAfter({
      notify(frame) {
        if (frame.event && frame.event.getName() === "onEnter") {
          fired.push(
            `${frame.fromState.getName()}->${frame.toState.getName()}`,
          );
        }
      },
    });

    await sm.triggerEvent("evt");
    await sm.checkTransitions();
    await sm.checkTransitions();
    // Only c's onEnter should fire (machine rests in c, then onEnter takes c->c2).
    // b's onEnter must NOT fire because the machine never rested in b.
    expect(fired).toEqual(["c->c2"]);
    // The machine must end in c2 (via c's correct onEnter), never in b2.
    expect(sm.getCurrentState().getName()).toBe("c2");
  });

  it("skips the stale onEnter op before acquiring the lock (no wasted lock/error)", async () => {
    // a --evt--> b (b declares onEnter: b --onEnter--> d); b --auto--> c (c has NO onEnter).
    // The machine passes through b to c. b's enqueued onEnter must be skipped
    // BEFORE acquiring the lock. The unfixed code instead acquires the lock for
    // it and then swallows a WrongEventForStateError — an extra acquireLock call.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addState("d")
      .addTransition("a", "b", { event: "evt" })
      .addTransition("b", "c") // automatic
      .addTransition("b", "d", { event: "onEnter" })
      .build();

    const mutex = new CountingMutex();
    const sm = new Statemachine({}, process, { mutex });
    sm.attachAfter(new OnEnterObserver());

    await sm.triggerEvent("evt");
    // checkTransitions queues BEHIND the stale onEnter op; awaiting it forces a
    // full FIFO drain so the stale op has definitely been processed/skipped.
    await sm.checkTransitions();

    // Fixed: evt acquires once, stale onEnter is skipped (no acquire),
    // checkTransitions acquires once → 2 total.
    // Unfixed: evt + stale-onEnter(acquires, then throws) + checkTransitions → 3.
    expect(mutex.acquireCount).toBe(2);
    expect(sm.getCurrentState().getName()).toBe("c");
  });
});
