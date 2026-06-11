import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
import type { EnqueueContext, TransitionFrame } from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("EnqueueContext.enqueue after the drain loop has exited", () => {
  it("still runs the chained operation (no stranded op)", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addState("s3")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s2", "s3", { event: "next" })
      .build();

    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_frame: TransitionFrame, ctx: EnqueueContext): void {
        // Schedule the enqueue for AFTER the current operation (and the
        // drain loop) has completed — the stranding scenario.
        if (_frame.toState.getName() === "s2") {
          setTimeout(() => ctx.enqueue("next"), 10);
        }
      },
    });

    await sm.triggerEvent("go");
    await sleep(100);
    expect(sm.getCurrentState().getName()).toBe("s3");
  });
});
