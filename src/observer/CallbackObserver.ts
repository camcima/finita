import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { MaybePromise } from "../MaybePromise.js";

/**
 * Legacy Observer for Event observers (commands attached to specific events).
 *
 * In v3 this is no longer used as a Statemachine observer. To run a
 * callback after every transition, implement AfterTransitionObserver
 * directly or compose a small wrapper.
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
    // Event-invoked path: args is [subject, context] — spread them into the callback.
    // Direct/legacy path: no args — pass the subject itself as the sole argument.
    if (args !== undefined && args.length > 0) {
      return this.callback(...args);
    }
    return this.callback(subject);
  }
}
