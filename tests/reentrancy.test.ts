import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  ReentrancyError,
  CallbackCondition,
  CallbackObserver,
  Contradiction,
} from "../src/index.js";
import type {
  TransitionFrame,
  TransitionSelectorInterface,
} from "../src/index.js";

describe("re-entrant triggerEvent from an observer", () => {
  it("throws ReentrancyError instead of deadlocking, machine stays usable", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "next" })
      .build();
    const sm = new Statemachine({}, process);

    const observer = {
      async notify(_frame: TransitionFrame): Promise<void> {
        await sm.triggerEvent("next"); // forbidden — would deadlock
      },
    };
    sm.attachAfter(observer);

    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(ReentrancyError);

    // The machine is NOT deadlocked: after removing the bad observer, it works.
    sm.detachAfter(observer);
    await sm.triggerEvent("next");
    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("flags a SECOND event-attached observer that re-enters the machine", async () => {
    // The first event observer "uses up" the synchronous guard window (the
    // notify loop awaits between observers), so a later observer that re-enters
    // must still be caught — otherwise it enqueues and deadlocks.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "next" })
      .build();
    const sm = new Statemachine({}, process);

    const event = process.getState("a").getEvent("go");
    // First observer: benign.
    event.attach(new CallbackObserver(() => {}));
    // Second observer: re-enters — must reject, not deadlock.
    event.attach(
      new CallbackObserver(async () => {
        await sm.triggerEvent("next");
      }),
    );

    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(ReentrancyError);
  }, 2000);

  it("flags a LATER transition's condition that re-enters the machine", async () => {
    // The first transition's isActive() check clears the synchronous guard
    // window, so a re-entrant condition on a later transition must still be
    // caught rather than deadlocking.
    const reentrantCondition = new CallbackCondition("reentrant", async () => {
      await sm0.sm!.triggerEvent("go");
      return true;
    });
    const sm0: { sm?: Statemachine } = {};
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      // First transition evaluated: benign, never active.
      .addTransition("a", "b", { event: "go", condition: new Contradiction() })
      // Second transition evaluated: its condition re-enters the machine.
      .addTransition("a", "c", { event: "go", condition: reentrantCondition })
      .build();
    const sm = new Statemachine({}, process);
    sm0.sm = sm;

    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(ReentrancyError);
  }, 2000);

  it("throws ReentrancyError when a condition re-enters the machine", async () => {
    const sm0: { sm?: Statemachine } = {};
    const reentrantCondition = new CallbackCondition("reentrant", async () => {
      await sm0.sm!.triggerEvent("go"); // re-entrant; rejects with ReentrancyError
      return true;
    });
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", condition: reentrantCondition })
      .build();
    const sm = new Statemachine({}, process);
    sm0.sm = sm;

    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(ReentrancyError);
  });

  it("flags a custom transition selector that re-enters the machine", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    const holder: { sm?: Statemachine } = {};
    let captured: unknown = null;
    const selector: TransitionSelectorInterface = {
      selectTransition(transitions) {
        // Synchronous re-entrant call from inside the selector — must reject.
        holder.sm!.checkTransitions().catch((e: unknown) => {
          captured = e;
        });
        for (const t of transitions) return t;
        return null;
      },
    };
    const sm = new Statemachine({}, process, { transitionSelector: selector });
    holder.sm = sm;

    await sm.triggerEvent("go");
    expect(captured).toBeInstanceOf(ReentrancyError);
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("does not flag a benign observer that awaits non-reentrant work", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      async notify(): Promise<void> {
        await Promise.resolve(); // legitimate async work, no re-entry
      },
    });
    await sm.triggerEvent("go"); // must resolve, not reject
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("does not flag concurrent external triggers (they queue normally)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "next" })
      .build();
    const sm = new Statemachine({}, process);
    // Fire both without awaiting the first — external concurrent calls.
    const p1 = sm.triggerEvent("go");
    const p2 = sm.triggerEvent("next");
    await Promise.all([p1, p2]);
    expect(sm.getCurrentState().getName()).toBe("c");
  });
});
