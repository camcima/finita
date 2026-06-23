import type { MaybePromise } from "../MaybePromise.js";

export interface Observer {
  /**
   * @param args The arguments the notification was invoked with — for
   * Statemachine events, [subject, context]. Passed per-call so shared
   * Event instances carry no per-invocation state.
   */
  update(
    subject: ObservableSubject,
    args?: readonly unknown[],
  ): MaybePromise<void>;
}

export interface ObservableSubject {
  attach(observer: Observer): void;
  detach(observer: Observer): void;
  notify(args?: readonly unknown[]): Promise<void>;
  getObservers(): Iterable<Observer>;
}
