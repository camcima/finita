import type { Observer } from "./Observer.js";
import type { StatemachineInterface } from "./StatemachineInterface.js";
import type { MutexFactoryInterface } from "./MutexFactoryInterface.js";
import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";

export interface FactoryInterface<TSubject = unknown> {
  createStatemachine(
    subject: TSubject,
  ): Promise<StatemachineInterface<TSubject>>;
  setMutexFactory(factory: MutexFactoryInterface<TSubject> | null): void;
  setTransitionSelector(
    selector: TransitionSelectorInterface<TSubject>,
  ): void;
  attachStatemachineObserver(observer: Observer): void;
  detachStatemachineObserver(observer: Observer): void;
  getStatemachineObservers(): Iterable<Observer>;
}
