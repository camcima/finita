import type { MaybePromise } from "../MaybePromise.js";
import type { ProposedTransitionFrame } from "./TransitionFrameInterface.js";

/**
 * Runs before a transition commits. Throwing aborts the transition —
 * state is not mutated and the original caller's promise rejects with
 * the thrown error.
 *
 * Implementations must be pure relative to the FSM: they MUST NOT call
 * triggerEvent / checkTransitions on the same Statemachine. Doing so throws
 * ReentrancyError when the call happens before the observer's first await;
 * calls made after an await cannot be detected and will deadlock. There is no
 * enqueue handle in the before phase by design — vetoes and validations
 * complete synchronously per observer; chained behaviour belongs in
 * AfterTransitionObserver.
 */
export interface BeforeTransitionObserver<TSubject = unknown> {
  notify(frame: ProposedTransitionFrame<TSubject>): MaybePromise<void>;
}
