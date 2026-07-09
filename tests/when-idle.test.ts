import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
import type { EnqueueContext, TransitionFrame } from "../src/index.js";

const chainProcess = () =>
  new ProcessBuilder("p")
    .addState("s1", { initial: true })
    .addState("s2")
    .addState("s3")
    .addTransition("s1", "s2", { event: "go" })
    .addTransition("s2", "s3", { event: "next" })
    .build();

const chainingObserver = () => ({
  notify(frame: TransitionFrame, ctx: EnqueueContext): void {
    if (frame.toState.getName() === "s2") ctx.enqueue("next");
  },
});

describe("Statemachine.whenIdle", () => {
  it("resolves immediately on an idle machine", async () => {
    const sm = new Statemachine({}, chainProcess());
    await expect(sm.whenIdle()).resolves.toBeUndefined();
  });

  it("resolves only after chained operations drain", async () => {
    const sm = new Statemachine({}, chainProcess());
    sm.attachAfter(chainingObserver());
    await sm.triggerEvent("go");
    await sm.whenIdle();
    expect(sm.getCurrentState().getName()).toBe("s3");
  });

  it("observes a drain that is still running when called", async () => {
    const sm = new Statemachine({}, chainProcess());
    sm.attachAfter(chainingObserver());
    const trigger = sm.triggerEvent("go");
    await sm.whenIdle();
    expect(sm.getCurrentState().getName()).toBe("s3");
    await trigger;
  });
});
