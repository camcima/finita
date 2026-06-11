import type { StateInterface } from "./StateInterface.js";
import type { TransitionInterface } from "./TransitionInterface.js";
import type { EventInterface } from "./EventInterface.js";
import type { ConditionInterface } from "./ConditionInterface.js";

/**
 * Immutable snapshot passed to transition observers.
 *
 * For AfterTransitionObserver.notify() the transition has committed:
 * state has already moved from fromState to toState. For
 * BeforeTransitionObserver.notify() the same shape represents the
 * *proposed* transition — fromState is still the current state, and
 * throwing aborts the commit. Reading any field is safe and stable for
 * the duration of the observer call (and beyond — the frame is frozen).
 */
export interface TransitionFrame<TSubject = unknown> {
  /** The subject this machine drives — identifies whose transition this is. */
  readonly subject: TSubject;
  readonly fromState: StateInterface;
  readonly toState: StateInterface;
  readonly transition: TransitionInterface<TSubject>;
  readonly event: EventInterface | null;
  readonly condition: ConditionInterface<TSubject> | null;
  readonly context: ReadonlyMap<string, unknown>;
  readonly timestamp: number;
  readonly machineName: string | null;
}

/**
 * The frame as seen by BeforeTransitionObserver — same shape; the
 * distinct name documents the pre-commit timing.
 */
export type ProposedTransitionFrame<TSubject = unknown> =
  TransitionFrame<TSubject>;
