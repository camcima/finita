import type { FactoryInterface } from "../interfaces/FactoryInterface.js";
import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { StateNameDetectorInterface } from "../interfaces/StateNameDetectorInterface.js";
import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { MutexFactoryInterface } from "../interfaces/MutexFactoryInterface.js";
import type { StatemachineInterface } from "../interfaces/StatemachineInterface.js";
import type { BeforeTransitionObserver } from "../interfaces/BeforeTransitionObserverInterface.js";
import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { StatemachineOptions } from "../interfaces/StatemachineOptions.js";
import { Statemachine } from "../Statemachine.js";

/**
 * Engine options applied to every machine the factory creates.
 *
 * `initialStateName`, `mutex` and `transitionSelector` are excluded: the
 * factory derives them per subject from the state-name detector, the mutex
 * factory and setTransitionSelector, so a template value could only
 * contradict them.
 */
export type FactoryStatemachineOptions<TSubject = unknown> = Omit<
  StatemachineOptions<TSubject>,
  "initialStateName" | "mutex" | "transitionSelector"
>;

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
  private readonly options: FactoryStatemachineOptions<TSubject>;

  /**
   * @param options Engine options applied to every machine this factory
   * creates — back-pressure (maxQueueLength), the automatic-hop bound, lock
   * autorelease, and the onChainedOperationError / onReleaseError diagnostic
   * sinks. Without them, factory-created machines would silently run on
   * defaults, which is precisely where those sinks matter most.
   */
  constructor(
    processDetector: ProcessDetectorInterface<TSubject>,
    stateNameDetector?: StateNameDetectorInterface<TSubject> | null,
    options: FactoryStatemachineOptions<TSubject> = {},
  ) {
    this.processDetector = processDetector;
    this.stateNameDetector = stateNameDetector ?? null;
    this.options = { ...options };
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
      ...this.options,
      initialStateName: stateName ?? undefined,
      transitionSelector: this.transitionSelector ?? undefined,
      mutex: mutex ?? undefined,
    });

    for (const o of this.beforeObservers) sm.attachBefore(o);
    for (const o of this.afterObservers) sm.attachAfter(o);

    return sm;
  }
}
