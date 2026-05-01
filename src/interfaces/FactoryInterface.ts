import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";
import type { MutexFactoryInterface } from "./MutexFactoryInterface.js";
import type { StatemachineInterface } from "./StatemachineInterface.js";
import type { BeforeTransitionObserver } from "./BeforeTransitionObserverInterface.js";
import type { AfterTransitionObserver } from "./AfterTransitionObserverInterface.js";

export interface FactoryInterface<TSubject = unknown> {
  setMutexFactory(factory: MutexFactoryInterface<TSubject> | null): void;
  setTransitionSelector(selector: TransitionSelectorInterface<TSubject>): void;
  attachBeforeObserver(observer: BeforeTransitionObserver<TSubject>): void;
  detachBeforeObserver(observer: BeforeTransitionObserver<TSubject>): void;
  attachAfterObserver(observer: AfterTransitionObserver<TSubject>): void;
  detachAfterObserver(observer: AfterTransitionObserver<TSubject>): void;
  createStatemachine(
    subject: TSubject,
  ): Promise<StatemachineInterface<TSubject>>;
}
