import type { MaybePromise } from "../MaybePromise.js";

export interface Observer {
  update(subject: ObservableSubject): MaybePromise<void>;
}

export interface ObservableSubject {
  attach(observer: Observer): void;
  detach(observer: Observer): void;
  notify(): Promise<void>;
  getObservers(): Iterable<Observer>;
}
