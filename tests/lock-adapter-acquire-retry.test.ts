import { describe, it, expect } from "vitest";
import { LockAdapterMutex } from "../src/index.js";
import type { LockAdapterInterface } from "../src/index.js";

/**
 * A failed acquire must never poison later attempts. Each case fails the
 * first adapter call in one of the four ways MaybePromise<boolean> permits,
 * then succeeds; the second mutex attempt must reach the adapter again.
 */
const failFirst = (
  firstCall: () => boolean | Promise<boolean>,
): { adapter: LockAdapterInterface; calls: () => number } => {
  let calls = 0;
  return {
    adapter: {
      acquireLock: () => (++calls === 1 ? firstCall() : true),
      releaseLock: () => true,
      isLocked: () => false,
    },
    calls: () => calls,
  };
};

const cases: Array<[string, () => boolean | Promise<boolean>]> = [
  [
    "a synchronous throw",
    () => {
      throw new Error("transient");
    },
  ],
  ["an asynchronous rejection", () => Promise.reject(new Error("transient"))],
  ["a synchronous false", () => false],
  ["an asynchronous false", () => Promise.resolve(false)],
];

describe("LockAdapterMutex acquire retry", () => {
  it.each(cases)("retries the adapter after %s", async (_label, firstCall) => {
    const { adapter, calls } = failFirst(firstCall);
    const mutex = new LockAdapterMutex(adapter, "resource");

    await mutex.acquireLock().catch(() => undefined);
    expect(await mutex.acquireLock()).toBe(true);
    expect(calls()).toBe(2);
    expect(mutex.isAcquired()).toBe(true);
  });

  it("still shares one adapter call between overlapping acquires", async () => {
    let calls = 0;
    let resolve!: (v: boolean) => void;
    const mutex = new LockAdapterMutex(
      {
        acquireLock: () => {
          calls++;
          return new Promise<boolean>((r) => (resolve = r));
        },
        releaseLock: () => true,
        isLocked: () => false,
      },
      "resource",
    );
    const first = mutex.acquireLock();
    const second = mutex.acquireLock();
    await Promise.resolve();
    resolve(true);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(calls).toBe(1);
  });
});
