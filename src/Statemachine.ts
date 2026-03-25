import type { StatemachineInterface } from "./interfaces/StatemachineInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { ProcessInterface } from "./interfaces/ProcessInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { MutexInterface } from "./interfaces/MutexInterface.js";
import type { TransitionSelectorInterface } from "./interfaces/TransitionSelectorInterface.js";
import type { DispatcherInterface } from "./interfaces/DispatcherInterface.js";
import type { Observer } from "./interfaces/Observer.js";
import type { Named } from "./interfaces/Named.js";
import { OneOrNoneActiveTransition } from "./selector/OneOrNoneActiveTransition.js";
import { NullMutex } from "./mutex/NullMutex.js";
import { Dispatcher } from "./Dispatcher.js";
import { ActiveTransitionFilter } from "./filter/ActiveTransitionFilter.js";
import { WrongEventForStateError } from "./error/WrongEventForStateError.js";
import { LockCanNotBeAcquiredError } from "./error/LockCanNotBeAcquiredError.js";

export class Statemachine<TSubject = unknown>
  implements StatemachineInterface<TSubject>
{
  private readonly subject: TSubject;
  private currentState: StateInterface;
  private lastState: StateInterface | null = null;
  private readonly transitionSelector: TransitionSelectorInterface<TSubject>;
  private selectedTransition: TransitionInterface<TSubject> | null = null;
  private readonly process: ProcessInterface;
  private readonly mutex: MutexInterface;
  private autoreleaseLock = true;
  private dispatcher: DispatcherInterface | null = null;
  private currentEvent: EventInterface | null = null;
  private currentContext: Map<string, unknown> | null = null;
  private readonly observers: Set<Observer> = new Set();

  constructor(
    subject: TSubject,
    process: ProcessInterface,
    stateName?: string | null,
    transitionSelector?: TransitionSelectorInterface<TSubject> | null,
    mutex?: MutexInterface | null,
  ) {
    this.subject = subject;
    if (stateName) {
      this.currentState = process.getState(stateName);
    } else {
      this.currentState = process.getInitialState();
    }
    this.transitionSelector =
      transitionSelector ?? new OneOrNoneActiveTransition();
    this.process = process;
    this.mutex = mutex ?? new NullMutex();
  }

  getProcess(): ProcessInterface {
    return this.process;
  }

  getCurrentState(): StateInterface {
    return this.currentState;
  }

  getLastState(): StateInterface | null {
    return this.lastState;
  }

  getSubject(): TSubject {
    return this.subject;
  }

  getSelectedTransition(): TransitionInterface<TSubject> | null {
    return this.selectedTransition;
  }

  getCurrentContext(): Map<string, unknown> | null {
    return this.currentContext;
  }

  private async doCheckTransitions(
    context: Map<string, unknown>,
    event?: EventInterface,
    automaticVisited?: Set<StateInterface>,
  ): Promise<void> {
    try {
      const transitions = this.currentState.getTransitions();
      const activeTransitions = await ActiveTransitionFilter.filter(
        transitions,
        this.subject,
        context,
        event,
      );
      this.selectedTransition =
        this.transitionSelector.selectTransition(activeTransitions);
      if (this.selectedTransition) {
        const targetState = this.selectedTransition.getTargetState();
        if (this.selectedTransition.getEventName() === null) {
          if (!automaticVisited) {
            automaticVisited = new Set<StateInterface>();
          }
          automaticVisited.add(this.currentState);
          if (automaticVisited.has(targetState)) {
            throw new Error(
              `Automatic transition cycle detected: state "${targetState.getName()}" was already visited — this would cause infinite recursion`,
            );
          }
        }
        if (this.currentState !== targetState) {
          this.lastState = this.currentState;
          this.currentState = targetState;
          this.currentContext = context;
          this.currentEvent = event ?? null;
          try {
            await this.notify();
          } finally {
            this.currentContext = null;
            this.currentEvent = null;
            this.selectedTransition = null;
            this.lastState = null;
          }
        }
        await this.doCheckTransitions(context, undefined, automaticVisited);
      }
    } catch (error) {
      let message = `Exception was thrown when doing a transition from current state "${this.currentState.getName()}"`;
      if (this.currentEvent) {
        message += ` with event "${this.currentEvent.getName()}"`;
      }
      const named = this.subject as Named;
      if (named && typeof named.getName === "function") {
        message += ` for "${named.getName()}"`;
      }
      throw new Error(message, { cause: error });
    }
  }

  private async onDispatcherReady(): Promise<void> {
    if (this.dispatcher && this.dispatcher.isReady()) {
      const context = this.currentContext!;
      const event = this.currentEvent ?? undefined;
      this.dispatcher = null;
      this.currentContext = null;
      this.currentEvent = null;
      try {
        await this.doCheckTransitions(context, event);
      } finally {
        if (this.autoreleaseLock && this.isLockAcquired()) {
          await this.releaseLock();
        }
      }
    }
  }

  async dispatchEvent(
    dispatcher: DispatcherInterface,
    name: string,
    context?: Map<string, unknown>,
  ): Promise<void> {
    if (this.dispatcher) {
      throw new Error("Event dispatching is still running!");
    }
    if (this.currentState.hasEvent(name)) {
      await this.acquireLockOrThrowException();
      try {
        this.dispatcher = dispatcher;
        this.currentContext = context ?? new Map();
        this.currentEvent = this.currentState.getEvent(name);
        dispatcher.dispatch(
          this.currentEvent,
          [this.subject, this.currentContext],
          { invoke: () => this.onDispatcherReady() },
        );
      } catch (error) {
        this.dispatcher = null;
        this.currentContext = null;
        this.currentEvent = null;
        if (this.autoreleaseLock) {
          await this.releaseLock();
        }
        throw error;
      }
    } else {
      throw new WrongEventForStateError(this.currentState.getName(), name);
    }
  }

  async triggerEvent(
    name: string,
    context?: Map<string, unknown>,
  ): Promise<void> {
    const dispatcher = new Dispatcher();
    try {
      await this.dispatchEvent(dispatcher, name, context);
      await dispatcher.invoke();
    } finally {
      this.dispatcher = null;
      this.currentContext = null;
      this.currentEvent = null;
      if (this.autoreleaseLock && this.isLockAcquired()) {
        await this.releaseLock();
      }
    }
  }

  async checkTransitions(context?: Map<string, unknown>): Promise<void> {
    await this.acquireLockOrThrowException();
    const ctx = context ?? new Map();
    try {
      await this.doCheckTransitions(ctx);
    } finally {
      if (this.autoreleaseLock && this.isLockAcquired()) {
        await this.releaseLock();
      }
    }
  }

  private async acquireLockOrThrowException(): Promise<void> {
    if (!(await this.acquireLock())) {
      throw new LockCanNotBeAcquiredError("Lock can not be acquired!");
    }
  }

  isAutoreleaseLock(): boolean {
    return this.autoreleaseLock;
  }

  setAutoreleaseLock(autorelease: boolean): void {
    this.autoreleaseLock = autorelease;
  }

  async acquireLock(): Promise<boolean> {
    if (this.mutex.isAcquired()) {
      return true;
    }
    return this.mutex.acquireLock();
  }

  async releaseLock(): Promise<void> {
    await this.mutex.releaseLock();
  }

  isLockAcquired(): boolean {
    return this.mutex.isAcquired();
  }

  attach(observer: Observer): void {
    this.observers.add(observer);
  }

  detach(observer: Observer): void {
    this.observers.delete(observer);
  }

  async notify(): Promise<void> {
    for (const observer of this.observers) {
      await observer.update(this);
    }
  }

  getObservers(): Iterable<Observer> {
    return this.observers;
  }
}
