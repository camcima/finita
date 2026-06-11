import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
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
