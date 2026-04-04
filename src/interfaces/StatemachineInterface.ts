import type { ObservableSubject } from "./Observer.js";
import type { StateInterface } from "./StateInterface.js";
import type { ProcessInterface } from "./ProcessInterface.js";
import type { TransitionInterface } from "./TransitionInterface.js";

export interface StatemachineInterface<
  TSubject = unknown,
> extends ObservableSubject {
  getCurrentState(): StateInterface;
  getSubject(): TSubject;
  getProcess(): ProcessInterface;
  triggerEvent(name: string, context?: Map<string, unknown>): Promise<void>;
  checkTransitions(context?: Map<string, unknown>): Promise<void>;
  getSelectedTransition(): TransitionInterface<TSubject> | null;
  getLastState(): StateInterface | null;
  getCurrentContext(): Map<string, unknown> | null;
  acquireLock(): Promise<boolean>;
  releaseLock(): Promise<void>;
  isLockAcquired(): boolean;
  isAutoreleaseLock(): boolean;
  setAutoreleaseLock(autorelease: boolean): void;
}
