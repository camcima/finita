import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
import type { AfterTransitionObserver, TransitionFrame } from "../src/index.js";

describe("observer detaching itself during notify", () => {
  it("does not skip the next observer", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);

    const calls: string[] = [];
    const oneShot: AfterTransitionObserver = {
      notify(_frame: TransitionFrame): void {
        calls.push("oneShot");
        sm.detachAfter(oneShot);
      },
    };
    const second: AfterTransitionObserver = {
      notify(_frame: TransitionFrame): void {
        calls.push("second");
      },
    };
    sm.attachAfter(oneShot);
    sm.attachAfter(second);

    await sm.triggerEvent("go");
    expect(calls).toEqual(["oneShot", "second"]);
  });
});
