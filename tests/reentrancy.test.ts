import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  ReentrancyError,
  CallbackCondition,
} from "../src/index.js";
import type { TransitionFrame } from "../src/index.js";

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
