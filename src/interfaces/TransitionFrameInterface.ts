import type { StateInterface } from "./StateInterface.js";
import type { TransitionInterface } from "./TransitionInterface.js";
import type { EventInterface } from "./EventInterface.js";
import type { ConditionInterface } from "./ConditionInterface.js";

/**
 * Immutable snapshot passed to AfterTransitionObserver.notify().
 *
 * Captures the post-commit transition: state has already moved from
 * fromState to toState. Reading any field is safe and stable for the
 * duration of the observer call (and beyond — the frame is frozen).
 */
export interface TransitionFrame<TSubject = unknown> {
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
 * Immutable snapshot passed to BeforeTransitionObserver.notify().
 *
 * Same shape as TransitionFrame but represents a *proposed* transition
 * — fromState is still the current state at notification time. Throwing
 * from a before-observer aborts the transition; otherwise commit proceeds.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProposedTransitionFrame<
  TSubject = unknown,
> extends TransitionFrame<TSubject> {}
