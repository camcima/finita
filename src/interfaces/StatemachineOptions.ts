import type { MutexInterface } from "./MutexInterface.js";
import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";

export interface StatemachineOptions<TSubject = unknown> {
  /** Override the process's initial state. Defaults to process.getInitialState(). */
  initialStateName?: string;
  /** Defaults to OneOrNoneActiveTransition. */
  transitionSelector?: TransitionSelectorInterface<TSubject>;
  /** Defaults to NullMutex (no cross-process serialization). */
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
}
