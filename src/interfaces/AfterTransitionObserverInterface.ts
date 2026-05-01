import type { MaybePromise } from "../MaybePromise.js";
import type { TransitionFrame } from "./TransitionFrameInterface.js";

/**
 * Handle passed to AfterTransitionObserver.notify so observers can
 * append events to the FSM's queue without reentering it.
 *
 * enqueue() never runs the event inline — it returns immediately. The
 * event runs as its own top-level operation after the current operation
 * (and any auto-follow-on transitions) completes.
 */
export interface EnqueueContext {
  enqueue(event: string, context?: Map<string, unknown>): void;
}

/**
 * Runs after a transition has committed. State has already moved.
 *
 * Errors thrown by an after-observer do NOT roll back the transition.
 * All after-observers are still invoked (no early bail). After all have
 * run, the caller's promise rejects: with the thrown error if exactly
 * one observer threw, or with a standard AggregateError if multiple did.
 */
export interface AfterTransitionObserver<TSubject = unknown> {
  notify(
    frame: TransitionFrame<TSubject>,
    ctx: EnqueueContext,
  ): MaybePromise<void>;
}
