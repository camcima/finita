import type { FactoryInterface } from "../interfaces/FactoryInterface.js";
import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { StateNameDetectorInterface } from "../interfaces/StateNameDetectorInterface.js";
import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { MutexFactoryInterface } from "../interfaces/MutexFactoryInterface.js";
import type { StatemachineInterface } from "../interfaces/StatemachineInterface.js";
import type { Observer } from "../interfaces/Observer.js";
import { Statemachine } from "../Statemachine.js";

export class Factory implements FactoryInterface {
  private readonly processDetector: ProcessDetectorInterface;
  private readonly stateNameDetector: StateNameDetectorInterface | null;
  private readonly statemachineObservers: Set<Observer> = new Set();
  private transitionSelector: TransitionSelectorInterface | null = null;
  private mutexFactory: MutexFactoryInterface | null = null;

  constructor(
    processDetector: ProcessDetectorInterface,
    stateNameDetector?: StateNameDetectorInterface | null,
  ) {
    this.processDetector = processDetector;
    this.stateNameDetector = stateNameDetector ?? null;
  }

  setMutexFactory(factory: MutexFactoryInterface | null): void {
    this.mutexFactory = factory;
  }

  setTransitionSelector(selector: TransitionSelectorInterface): void {
    this.transitionSelector = selector;
  }

  attachStatemachineObserver(observer: Observer): void {
    this.statemachineObservers.add(observer);
  }

  detachStatemachineObserver(observer: Observer): void {
    this.statemachineObservers.delete(observer);
  }

  getStatemachineObservers(): Iterable<Observer> {
    return this.statemachineObservers;
  }

  async createStatemachine(subject: unknown): Promise<StatemachineInterface> {
    const process = this.processDetector.detectProcess(subject);

    const stateName = this.stateNameDetector
      ? this.stateNameDetector.detectCurrentStateName(subject)
      : null;

    const mutex = this.mutexFactory
      ? await this.mutexFactory.createMutex(subject)
      : null;

    const statemachine = new Statemachine(
      subject,
      process,
      stateName,
      this.transitionSelector,
      mutex,
    );

    for (const observer of this.statemachineObservers) {
      statemachine.attach(observer);
    }

    return statemachine;
  }
}
