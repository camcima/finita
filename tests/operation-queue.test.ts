import { describe, it, expect } from "vitest";
import { OperationQueue } from "../src/internal/OperationQueue.js";
import type { QueuedOperation } from "../src/internal/OperationQueue.js";

const op = (eventName: string): QueuedOperation => ({
  eventName,
  context: new Map(),
  resolve: () => undefined,
  reject: () => undefined,
});

describe("OperationQueue", () => {
  it("is FIFO across interleaved enqueues and dequeues", () => {
    const q = new OperationQueue();
    q.enqueue(op("1"));
    q.enqueue(op("2"));
    expect(q.dequeue()?.eventName).toBe("1");
    q.enqueue(op("3"));
    expect(q.size()).toBe(2);
    expect(q.dequeue()?.eventName).toBe("2");
    expect(q.dequeue()?.eventName).toBe("3");
    expect(q.dequeue()).toBeUndefined();
    expect(q.isEmpty()).toBe(true);
    expect(q.size()).toBe(0);
  });

  it("does not retain dequeued operations", () => {
    const q = new OperationQueue();
    for (let i = 0; i < 3; i++) q.enqueue(op(String(i)));
    q.dequeue();
    const internals = q as unknown as { items: unknown[] };
    expect(internals.items.filter((x) => x !== undefined)).toHaveLength(2);
  });

  it("drains a large backlog in linear time", () => {
    // Array.shift() made draining quadratic: about 1.3s for 100k operations
    // under vitest, versus about 5ms with the head index. Only the drain is
    // timed, and the bound leaves wide headroom for slow or loaded CI hosts.
    const q = new OperationQueue();
    const n = 100_000;
    for (let i = 0; i < n; i++) q.enqueue(op(String(i)));
    const start = performance.now();
    while (!q.isEmpty()) q.dequeue();
    expect(performance.now() - start).toBeLessThan(250);
  });
});

describe("OperationQueue compaction", () => {
  it("stays FIFO across compaction of a queue that never empties", () => {
    const q = new OperationQueue();
    let next = 0;
    let expected = 0;
    q.enqueue(op(String(next++)));
    for (let i = 0; i < 5000; i++) {
      q.enqueue(op(String(next++)));
      q.enqueue(op(String(next++)));
      expect(q.dequeue()?.eventName).toBe(String(expected++));
    }
    expect(q.size()).toBe(next - expected);
    while (!q.isEmpty()) {
      expect(q.dequeue()?.eventName).toBe(String(expected++));
    }
    expect(expected).toBe(next);
  });
});
