import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { EventInterface } from "../interfaces/EventInterface.js";
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

  update(subject: ObservableSubject): MaybePromise<void> {
    const event = subject as EventInterface;
    if (typeof event.getInvokeArgs === "function") {
      return this.callback(...event.getInvokeArgs());
    }
    return this.callback(subject);
  }
}
