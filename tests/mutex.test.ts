import { describe, it, expect, vi } from "vitest";
import { NullMutex, LockAdapterMutex } from "../src/index.js";
import type { LockAdapterInterface } from "../src/index.js";

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
