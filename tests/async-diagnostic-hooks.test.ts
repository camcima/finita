import { describe, it, expect, afterEach } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
import type {
  EnqueueContext,
  MutexInterface,
  TransitionFrame,
} from "../src/index.js";

/**
 * Diagnostic hooks may be async. A hook's rejection — immediate or delayed —
 * must be contained exactly like a synchronous throw: the original outcome
 * stands, the queue keeps draining, and nothing reaches the host as an
 * unhandled rejection.
 */
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};
process.on("unhandledRejection", onUnhandled);
afterEach(() => {
  unhandled.length = 0;
});

const settle = () => new Promise((r) => setTimeout(r, 30));

const hookFailures: Array<[string, () => void | Promise<void>]> = [
  [
    "a synchronous throw",
    () => {
      throw new Error("hook");
    },
  ],
  ["an immediate rejection", () => Promise.reject(new Error("hook"))],
  [
    "a delayed rejection",
    () =>
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("hook")), 5),
      ),
  ],
];

const build = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addState("c")
    .addTransition("a", "b", { event: "go" })
    .addTransition("b", "c", { event: "next" })
    .build();

const throwingReleaseMutex = (): MutexInterface => {
  let acquired = false;
  return {
    acquireLock: () => (acquired = true),
    releaseLock: () => {
      acquired = false;
      throw new Error("release failed");
    },
    isAcquired: () => acquired,
    isLocked: () => acquired,
  };
};

describe("async onChainedOperationError", () => {
  it.each(hookFailures)(
    "contains %s and keeps draining",
    async (_label, hook) => {
      const sm = new Statemachine({}, build(), {
        onChainedOperationError: hook,
      });
      let enqueued = false;
      sm.attachAfter({
        notify(_frame: TransitionFrame, ctx: EnqueueContext): void {
          if (enqueued) return;
          enqueued = true;
          ctx.enqueue("missing");
          ctx.enqueue("next");
        },
      });
      await sm.triggerEvent("go");
      await sm.whenIdle();
      await settle();
      expect(sm.getCurrentState().getName()).toBe("c");
      expect(unhandled).toEqual([]);
    },
  );
});

describe("async onReleaseError", () => {
  it.each(hookFailures)(
    "contains %s and preserves the rejection",
    async (_label, hook) => {
      const sm = new Statemachine({}, build(), {
        mutex: throwingReleaseMutex(),
        onReleaseError: hook,
      });
      await expect(sm.triggerEvent("go")).rejects.toThrowError(
        "release failed",
      );
      await settle();
      expect(unhandled).toEqual([]);
    },
  );
});
