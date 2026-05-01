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
}
