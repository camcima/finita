export interface QueuedOperation {
  /** Event name for triggerEvent operations; null for checkTransitions. */
  eventName: string | null;
  context: Map<string, unknown>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * FIFO queue of pending top-level Statemachine operations.
 *
 * Holds the deferred resolvers so that callers' promises can be settled
 * by the engine when their operation runs. Has no side effects beyond
 * push/shift; the Statemachine drives execution.
 */
export class OperationQueue {
  private readonly items: QueuedOperation[] = [];

  enqueue(op: QueuedOperation): void {
    this.items.push(op);
  }

  dequeue(): QueuedOperation | undefined {
    return this.items.shift();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}
