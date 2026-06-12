import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  WrongEventForStateError,
} from "../src/index.js";
import type { MutexInterface } from "../src/index.js";

/** Mutex whose release takes real async time — models a redis/DB advisory lock. */
class SlowReleaseMutex implements MutexInterface {
  private acquired = false;
  async acquireLock(): Promise<boolean> {
    if (this.acquired) return false;
    this.acquired = true;
    return true;
  }
  async releaseLock(): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 20));
    this.acquired = false;
    return true;
  }
  isAcquired(): boolean {
    return this.acquired;
  }
  async isLocked(): Promise<boolean> {
    return this.acquired;
  }
}

describe("caller resumes only after the lock is released", () => {
  it("isLockAcquired() is false immediately after awaiting triggerEvent", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    const sm = new Statemachine({}, process, { mutex: new SlowReleaseMutex() });
    await sm.triggerEvent("go");
    expect(sm.isLockAcquired()).toBe(false);
  });
});

/** Mutex whose release always fails — models a dropped redis/DB connection. */
class FailingReleaseMutex implements MutexInterface {
  readonly releaseError = new Error("release failed: connection lost");
  private acquired = false;
  async acquireLock(): Promise<boolean> {
    if (this.acquired) return false;
    this.acquired = true;
    return true;
  }
  async releaseLock(): Promise<boolean> {
    throw this.releaseError;
  }
  isAcquired(): boolean {
    return this.acquired;
  }
  async isLocked(): Promise<boolean> {
    return this.acquired;
  }
}

describe("releaseLock failures", () => {
  const buildProcess = () =>
    new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

  it("rejects a successful operation when the lock release fails", async () => {
    const mutex = new FailingReleaseMutex();
    const sm = new Statemachine({}, buildProcess(), { mutex });
    // The caller must learn the lock may still be held; silently resolving
    // would let every later op piggyback on (and never release) the lock.
    await expect(sm.triggerEvent("go")).rejects.toBe(mutex.releaseError);
    // The transition itself committed before the release ran.
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("does not mask an operation error with the release error", async () => {
    const mutex = new FailingReleaseMutex();
    const sm = new Statemachine({}, buildProcess(), { mutex });
    // Both the operation AND the release fail — the operation error wins.
    await expect(sm.triggerEvent("nope")).rejects.toBeInstanceOf(
      WrongEventForStateError,
    );
  });
});
