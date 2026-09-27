export interface QueuedOperation {
  /** Event name for triggerEvent operations; null for checkTransitions. */
  eventName: string | null;
  context: Map<string, unknown>;
  /** When set, the op is silently skipped unless the machine is still in this state when the op is dispatched (top of runOperation). */
  ifStateName?: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * FIFO queue of pending top-level Statemachine operations.
 *
 * Holds the deferred resolvers so that callers' promises can be settled
 * by the engine when their operation runs. Has no side effects beyond
 * storage; the Statemachine drives execution.
 *
 * Dequeue advances a head index instead of calling Array.shift(), which is
 * O(n) and made draining a large backlog quadratic. Consumed slots are
 * cleared so operations are not retained, storage resets whenever the queue
 * empties, and a queue that never empties is compacted once the consumed
 * prefix dominates.
 */
export class OperationQueue {
  private static readonly COMPACT_THRESHOLD = 1024;

  private items: Array<QueuedOperation | undefined> = [];
  private head = 0;

  enqueue(op: QueuedOperation): void {
    this.items.push(op);
  }

  dequeue(): QueuedOperation | undefined {
    if (this.head >= this.items.length) {
      return undefined;
    }
    const op = this.items[this.head];
    this.items[this.head] = undefined;
    this.head++;
    if (this.head === this.items.length) {
      this.items = [];
      this.head = 0;
    } else if (
      this.head >= OperationQueue.COMPACT_THRESHOLD &&
      this.head * 2 >= this.items.length
    ) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return op;
  }

  isEmpty(): boolean {
    return this.head === this.items.length;
  }

  size(): number {
    return this.items.length - this.head;
  }
}
