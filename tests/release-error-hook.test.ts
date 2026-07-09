import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  WrongEventForStateError,
} from "../src/index.js";
import type { MutexInterface } from "../src/index.js";

const throwingReleaseMutex = (): MutexInterface => {
  let acquired = false;
  return {
    acquireLock: async () => {
      acquired = true;
      return true;
    },
    releaseLock: async () => {
      throw new Error("release failed");
    },
    isAcquired: () => acquired,
    isLocked: async () => acquired,
  };
};

const build = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();

describe("onReleaseError", () => {
  it("still rejects with the release error when the operation succeeded", async () => {
    const seen: unknown[] = [];
    const sm = new Statemachine({}, build(), {
      mutex: throwingReleaseMutex(),
      onReleaseError: (err) => seen.push(err),
    });
    await expect(sm.triggerEvent("go")).rejects.toThrowError("release failed");
    expect(seen).toHaveLength(1);
  });

  it("reports the release error even when the operation also failed", async () => {
    const seen: unknown[] = [];
    const sm = new Statemachine({}, build(), {
      mutex: throwingReleaseMutex(),
      onReleaseError: (err) => seen.push(err),
    });
    await expect(sm.triggerEvent("nope")).rejects.toBeInstanceOf(
      WrongEventForStateError,
    );
    expect(seen).toHaveLength(1);
    expect((seen[0] as Error).message).toBe("release failed");
  });

  it("a throwing hook does not change the rejection", async () => {
    const sm = new Statemachine({}, build(), {
      mutex: throwingReleaseMutex(),
      onReleaseError: () => {
        throw new Error("hook exploded");
      },
    });
    await expect(sm.triggerEvent("go")).rejects.toThrowError("release failed");
  });
});
