import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  WrongEventForStateError,
} from "../src/index.js";
import type { EnqueueContext, TransitionFrame } from "../src/index.js";

const build = () =>
  new ProcessBuilder("p")
    .addState("s1", { initial: true })
    .addState("s2")
    .addTransition("s1", "s2", { event: "go" })
    .build();

const enqueueInvalid = () => ({
  notify(_frame: TransitionFrame, ctx: EnqueueContext): void {
    ctx.enqueue("does-not-exist");
  },
});

describe("onChainedOperationError", () => {
  it("receives failures from chained operations that the caller never sees", async () => {
    const seen: { error: unknown; eventName: string }[] = [];
    const sm = new Statemachine({}, build(), {
      onChainedOperationError: (error, info) =>
        seen.push({ error, eventName: info.eventName }),
    });
    sm.attachAfter(enqueueInvalid());

    await expect(sm.triggerEvent("go")).resolves.toBeUndefined();
    await sm.whenIdle();

    expect(seen).toHaveLength(1);
    expect(seen[0].error).toBeInstanceOf(WrongEventForStateError);
    expect(seen[0].eventName).toBe("does-not-exist");
  });

  it("a throwing hook does not break the drain loop", async () => {
    const sm = new Statemachine({}, build(), {
      onChainedOperationError: () => {
        throw new Error("hook exploded");
      },
    });
    sm.attachAfter(enqueueInvalid());

    await sm.triggerEvent("go");
    await sm.whenIdle();
    expect(sm.getCurrentState().getName()).toBe("s2");
  });

  it("without the hook, chained failures remain silent (previous behavior)", async () => {
    const sm = new Statemachine({}, build());
    sm.attachAfter(enqueueInvalid());
    await expect(sm.triggerEvent("go")).resolves.toBeUndefined();
    await sm.whenIdle();
    expect(sm.getCurrentState().getName()).toBe("s2");
  });
});
