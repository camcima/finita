import type { Observer } from "./Observer.js";
import type { StatemachineInterface } from "./StatemachineInterface.js";
import type { MutexFactoryInterface } from "./MutexFactoryInterface.js";
import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";

export interface FactoryInterface {
  createStatemachine(subject: unknown): Promise<StatemachineInterface>;
  setMutexFactory(factory: MutexFactoryInterface | null): void;
  setTransitionSelector(selector: TransitionSelectorInterface): void;
  attachStatemachineObserver(observer: Observer): void;
  detachStatemachineObserver(observer: Observer): void;
  getStatemachineObservers(): Iterable<Observer>;
}
