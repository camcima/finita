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
    // SEMANTIC / contract test: onEnter fires only for the state the machine rests in (c),
    // never for a state it passed through (b). The assertions — fired=["c->c2"] and final
    // state c2 — document the intended contract. Note: in this topology the fired array and
    // final state coincide on both fixed and unfixed code, so these assertions alone do not
    // distinguish them. The genuine pre-fix-failing regression is the counting-mutex test
    // below ("skips the stale onEnter op before acquiring the lock").
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
