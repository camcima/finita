import { describe, it, expect, vi } from "vitest";
import {
  NullMutex,
  LockAdapterMutex,
  Statemachine,
  ProcessBuilder,
} from "../src/index.js";
import type { LockAdapterInterface, MutexInterface } from "../src/index.js";

describe("NullMutex", () => {
  it("should always acquire lock", () => {
    const mutex = new NullMutex();
    expect(mutex.acquireLock()).toBe(true);
    expect(mutex.isAcquired()).toBe(true);
  });

  it("should release lock", () => {
    const mutex = new NullMutex();
    mutex.acquireLock();
    expect(mutex.releaseLock()).toBe(true);
    expect(mutex.isAcquired()).toBe(false);
  });

  it("should never report isLocked", () => {
    const mutex = new NullMutex();
    expect(mutex.isLocked()).toBe(false);
  });
});

describe("LockAdapterMutex", () => {
  function createAdapter(): LockAdapterInterface {
    const locks = new Map<string, boolean>();
    return {
      acquireLock: vi.fn((name: string) => {
        if (locks.get(name)) return false;
        locks.set(name, true);
        return true;
      }),
      releaseLock: vi.fn((name: string) => {
        locks.delete(name);
        return true;
      }),
      isLocked: vi.fn((name: string) => locks.has(name)),
    };
  }

  it("should delegate to lock adapter", async () => {
    const adapter = createAdapter();
    const mutex = new LockAdapterMutex(adapter, "resource1");
    expect(await mutex.acquireLock()).toBe(true);
    expect(mutex.isAcquired()).toBe(true);
    expect(adapter.acquireLock).toHaveBeenCalledWith("resource1");
  });

  it("should not re-acquire if already acquired", async () => {
    const adapter = createAdapter();
    const mutex = new LockAdapterMutex(adapter, "resource1");
    await mutex.acquireLock();
    await mutex.acquireLock();
    expect(adapter.acquireLock).toHaveBeenCalledTimes(1);
  });

  it("should release lock", async () => {
    const adapter = createAdapter();
    const mutex = new LockAdapterMutex(adapter, "resource1");
    await mutex.acquireLock();
    expect(await mutex.releaseLock()).toBe(true);
    expect(mutex.isAcquired()).toBe(false);
  });

  it("should not release if not acquired", async () => {
    const adapter = createAdapter();
    const mutex = new LockAdapterMutex(adapter, "resource1");
    expect(await mutex.releaseLock()).toBe(false);
  });

  it("should delegate isLocked", async () => {
    const adapter = createAdapter();
    const mutex = new LockAdapterMutex(adapter, "resource1");
    await mutex.acquireLock();
    expect(await mutex.isLocked()).toBe(true);
  });
});

describe("Statemachine mutex regression", () => {
  it("honors an already-held mutex without reacquiring (review fix)", async () => {
    class NonIdempotentMutex implements MutexInterface {
      private acquired = false;

      acquireLock(): boolean {
        if (this.acquired) {
          throw new Error(
            "NonIdempotentMutex.acquireLock called while already acquired",
          );
        }
        this.acquired = true;
        return true;
      }

      releaseLock(): boolean {
        if (!this.acquired) {
          throw new Error(
            "NonIdempotentMutex.releaseLock called while not acquired",
          );
        }
        this.acquired = false;
        return true;
      }

      isAcquired(): boolean {
        return this.acquired;
      }

      isLocked(): boolean {
        return false;
      }
    }

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const mutex = new NonIdempotentMutex();
    const sm = new Statemachine({}, process, {
      mutex,
      autoreleaseLock: false,
    });

    const acquired = await sm.acquireLock();
    expect(acquired).toBe(true);
    expect(mutex.isAcquired()).toBe(true);

    // The bug being fixed: runOperation used to call mutex.acquireLock()
    // unconditionally, which throws on a non-idempotent mutex that's
    // already held by the user. After the fix, runOperation skips
    // acquire+release when isAcquired() is already true.
    await sm.triggerEvent("go");
    expect(sm.getCurrentState().getName()).toBe("b");
    expect(mutex.isAcquired()).toBe(true); // still held by the user

    await sm.releaseLock();
    expect(mutex.isAcquired()).toBe(false);
  });
});

describe("LockAdapterMutex concurrent acquire", () => {
  it("acquires the underlying lock once when two acquires overlap", async () => {
    let adapterAcquires = 0;
    const adapter: LockAdapterInterface = {
      async acquireLock(): Promise<boolean> {
        adapterAcquires += 1;
        await new Promise((r) => setTimeout(r, 10));
        return true;
      },
      async releaseLock(): Promise<boolean> {
        return true;
      },
      async isLocked(): Promise<boolean> {
        return true;
      },
    };
    const mutex = new LockAdapterMutex(adapter, "resource");

    // Both calls start before either resolves — the `!this.acquired` check
    // alone lets both through and double-acquires a non-idempotent adapter.
    const [first, second] = await Promise.all([
      mutex.acquireLock(),
      mutex.acquireLock(),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(adapterAcquires).toBe(1);
    expect(mutex.isAcquired()).toBe(true);
  });

  it("retries after a failed acquire", async () => {
    let adapterAcquires = 0;
    const adapter: LockAdapterInterface = {
      async acquireLock(): Promise<boolean> {
        adapterAcquires += 1;
        return adapterAcquires > 1; // first attempt fails, later ones succeed
      },
      async releaseLock(): Promise<boolean> {
        return true;
      },
      async isLocked(): Promise<boolean> {
        return false;
      },
    };
    const mutex = new LockAdapterMutex(adapter, "resource");

    expect(await mutex.acquireLock()).toBe(false);
    expect(await mutex.acquireLock()).toBe(true);
    expect(adapterAcquires).toBe(2);
  });
});
