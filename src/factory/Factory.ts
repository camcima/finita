import type { FactoryInterface } from "../interfaces/FactoryInterface.js";
import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { StateNameDetectorInterface } from "../interfaces/StateNameDetectorInterface.js";
import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { MutexFactoryInterface } from "../interfaces/MutexFactoryInterface.js";
import type { StatemachineInterface } from "../interfaces/StatemachineInterface.js";
import type { BeforeTransitionObserver } from "../interfaces/BeforeTransitionObserverInterface.js";
import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import { Statemachine } from "../Statemachine.js";

export class Factory<TSubject = unknown> implements FactoryInterface<TSubject> {
  private readonly processDetector: ProcessDetectorInterface<TSubject>;
  private readonly stateNameDetector: StateNameDetectorInterface<TSubject> | null;
  private readonly beforeObservers: Set<BeforeTransitionObserver<TSubject>> =
    new Set();
  private readonly afterObservers: Set<AfterTransitionObserver<TSubject>> =
    new Set();
  private transitionSelector: TransitionSelectorInterface<TSubject> | null =
    null;
  private mutexFactory: MutexFactoryInterface<TSubject> | null = null;

  constructor(
    processDetector: ProcessDetectorInterface<TSubject>,
    stateNameDetector?: StateNameDetectorInterface<TSubject> | null,
  ) {
    this.processDetector = processDetector;
    this.stateNameDetector = stateNameDetector ?? null;
  }

  setMutexFactory(factory: MutexFactoryInterface<TSubject> | null): void {
    this.mutexFactory = factory;
  }

  setTransitionSelector(selector: TransitionSelectorInterface<TSubject>): void {
    this.transitionSelector = selector;
  }

  attachBeforeObserver(observer: BeforeTransitionObserver<TSubject>): void {
    this.beforeObservers.add(observer);
  }

  detachBeforeObserver(observer: BeforeTransitionObserver<TSubject>): void {
    this.beforeObservers.delete(observer);
  }

  attachAfterObserver(observer: AfterTransitionObserver<TSubject>): void {
    this.afterObservers.add(observer);
  }

  detachAfterObserver(observer: AfterTransitionObserver<TSubject>): void {
    this.afterObservers.delete(observer);
  }

  async createStatemachine(
    subject: TSubject,
  ): Promise<StatemachineInterface<TSubject>> {
    const process = this.processDetector.detectProcess(subject);
    const stateName = this.stateNameDetector
      ? this.stateNameDetector.detectCurrentStateName(subject)
      : undefined;
    const mutex = this.mutexFactory
      ? await this.mutexFactory.createMutex(subject)
      : undefined;

    const sm = new Statemachine<TSubject>(subject, process, {
      initialStateName: stateName ?? undefined,
      transitionSelector: this.transitionSelector ?? undefined,
      mutex: mutex ?? undefined,
    });

    for (const o of this.beforeObservers) sm.attachBefore(o);
    for (const o of this.afterObservers) sm.attachAfter(o);

    return sm;
  }
}
