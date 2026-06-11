import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine, ReentrancyError } from "../src/index.js";
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
});
