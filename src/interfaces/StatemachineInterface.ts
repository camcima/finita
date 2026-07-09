import type { StateInterface } from "./StateInterface.js";
import type { ProcessInterface } from "./ProcessInterface.js";
import type { BeforeTransitionObserver } from "./BeforeTransitionObserverInterface.js";
import type { AfterTransitionObserver } from "./AfterTransitionObserverInterface.js";

export interface StatemachineInterface<TSubject = unknown> {
  getCurrentState(): StateInterface;
  getLastState(): StateInterface | null;
  getSubject(): TSubject;
  getProcess(): ProcessInterface;

  triggerEvent(name: string, context?: Map<string, unknown>): Promise<void>;
  checkTransitions(context?: Map<string, unknown>): Promise<void>;

  /**
   * Resolves once the operation queue is empty and the runner is idle,
   * including operations chained via EnqueueContext.enqueue(). Resolves
   * immediately if the machine is already idle.
   */
  whenIdle(): Promise<void>;

  attachBefore(observer: BeforeTransitionObserver<TSubject>): void;
  detachBefore(observer: BeforeTransitionObserver<TSubject>): void;
  getBeforeObservers(): Iterable<BeforeTransitionObserver<TSubject>>;

  attachAfter(observer: AfterTransitionObserver<TSubject>): void;
  detachAfter(observer: AfterTransitionObserver<TSubject>): void;
  getAfterObservers(): Iterable<AfterTransitionObserver<TSubject>>;

  acquireLock(): Promise<boolean>;
  releaseLock(): Promise<void>;
  isLockAcquired(): boolean;

  isAutoreleaseLock(): boolean;
  setAutoreleaseLock(autorelease: boolean): void;
}
