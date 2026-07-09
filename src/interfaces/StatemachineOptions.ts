import type { MutexInterface } from "./MutexInterface.js";
import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";

export interface StatemachineOptions<TSubject = unknown> {
  /** Override the process's initial state. Defaults to process.getInitialState(). */
  initialStateName?: string;
  /** Defaults to OneOrNoneActiveTransition. */
  transitionSelector?: TransitionSelectorInterface<TSubject>;
  /**
   * Defaults to NullMutex (no cross-process serialization).
   *
   * Must be exclusive to this machine — never share one MutexInterface
   * instance between machines: the engine reads isAcquired() as "this
   * machine holds the lock", so a shared instance silently disables mutual
   * exclusion. To coordinate machines, share the underlying
   * LockAdapterInterface (same resource name) and construct one mutex per
   * machine, as MutexFactory does.
   */
  mutex?: MutexInterface;
  /** When true, the engine releases the mutex at the end of each top-level operation. Defaults to true. */
  autoreleaseLock?: boolean;
  /**
   * Maximum number of automatic (eventless) transitions a single operation
   * may take before AutomaticTransitionCycleError is thrown. Guards against
   * non-terminating automatic loops while allowing legitimate bounded loops
   * (e.g. condition-terminated retry cycles). Note: transitions committed
   * before the limit is hit are NOT rolled back. Must be a positive integer;
   * constructing a Statemachine with a value < 1 throws a RangeError.
   * Defaults to 100.
   */
  maxAutomaticHops?: number;
  /**
   * Called when an operation chained via EnqueueContext.enqueue() fails.
   * Chained operations are not awaited by the caller whose transition
   * enqueued them, so without this hook their errors are discarded.
   * Exceptions thrown by the hook itself are swallowed — it must not be
   * able to break the machine's drain loop.
   */
  onChainedOperationError?: (
    error: unknown,
    info: { eventName: string },
  ) => void;
  /**
   * Maximum number of operations that may wait in the queue (the running
   * operation does not count). When the limit is reached, further
   * triggerEvent/checkTransitions calls reject with
   * QueueLimitExceededError, and EnqueueContext.enqueue() throws it into
   * the enqueuing after-observer's error path. Must be a positive integer
   * when set. Defaults to Infinity (unbounded, the previous behavior).
   */
  maxQueueLength?: number;
  /**
   * Diagnostic hook called whenever the automatic post-operation lock
   * release throws — including when the operation itself also failed, in
   * which case the caller's rejection carries the operation error and the
   * release error would otherwise be discarded. Does not change rejection
   * behavior. Exceptions thrown by the hook itself are swallowed.
   */
  onReleaseError?: (error: unknown) => void;
}
