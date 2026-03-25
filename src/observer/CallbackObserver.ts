import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { EventInterface } from "../interfaces/EventInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

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
