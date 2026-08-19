import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { MaybePromise } from "../MaybePromise.js";

/**
 * Observer for Event observers (commands attached to specific events).
 *
 * This is not a Statemachine observer. To run a callback after every
 * transition, implement AfterTransitionObserver directly or compose a small
 * wrapper.
 */
export class CallbackObserver implements Observer {
  private readonly callback: (...args: unknown[]) => MaybePromise<void>;

  constructor(callback: (...args: unknown[]) => MaybePromise<void>) {
    this.callback = callback;
  }

  update(
    subject: ObservableSubject,
    args?: readonly unknown[],
  ): MaybePromise<void> {
    // Event-invoked path: args is the invoke argument list — spread it into
    // the callback. An empty list means the event was invoked with zero args,
    // so the callback receives zero args (matching pre-v3.1 behavior).
    if (args !== undefined) {
      return this.callback(...args);
    }
    // Direct/legacy path: update(subject) with no args — pass the subject.
    return this.callback(subject);
  }
}
