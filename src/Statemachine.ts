import type { StatemachineInterface } from "./interfaces/StatemachineInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { ProcessInterface } from "./interfaces/ProcessInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { MutexInterface } from "./interfaces/MutexInterface.js";
import type { TransitionSelectorInterface } from "./interfaces/TransitionSelectorInterface.js";
import type { BeforeTransitionObserver } from "./interfaces/BeforeTransitionObserverInterface.js";
import type {
  AfterTransitionObserver,
  EnqueueContext,
} from "./interfaces/AfterTransitionObserverInterface.js";
import type {
  TransitionFrame,
  ProposedTransitionFrame,
} from "./interfaces/TransitionFrameInterface.js";
import type { StatemachineOptions } from "./interfaces/StatemachineOptions.js";
import { OneOrNoneActiveTransition } from "./selector/OneOrNoneActiveTransition.js";
import { NullMutex } from "./mutex/NullMutex.js";
import { Dispatcher } from "./internal/Dispatcher.js";
import { OperationQueue } from "./internal/OperationQueue.js";
import type { QueuedOperation } from "./internal/OperationQueue.js";
import { ActiveTransitionFilter } from "./filter/ActiveTransitionFilter.js";
import { WrongEventForStateError } from "./error/WrongEventForStateError.js";
import { LockCanNotBeAcquiredError } from "./error/LockCanNotBeAcquiredError.js";
import { AutomaticTransitionCycleError } from "./error/AutomaticTransitionCycleError.js";

export class Statemachine<
  TSubject = unknown,
> implements StatemachineInterface<TSubject> {
  private readonly subject: TSubject;
  private readonly process: ProcessInterface;
  private readonly transitionSelector: TransitionSelectorInterface<TSubject>;
  private readonly mutex: MutexInterface;

  private currentState: StateInterface;
  private lastState: StateInterface | null = null;

  private autoreleaseLock: boolean;

  private readonly queue = new OperationQueue();
  private running = false;

  private readonly beforeObservers: BeforeTransitionObserver<TSubject>[] = [];
  private readonly afterObservers: AfterTransitionObserver<TSubject>[] = [];

  constructor(
    subject: TSubject,
    process: ProcessInterface,
    options: StatemachineOptions<TSubject> = {},
  ) {
    this.subject = subject;
    this.process = process;
    this.currentState = options.initialStateName
      ? process.getState(options.initialStateName)
      : process.getInitialState();
    this.transitionSelector =
      options.transitionSelector ?? new OneOrNoneActiveTransition<TSubject>();
    this.mutex = options.mutex ?? new NullMutex();
    this.autoreleaseLock = options.autoreleaseLock ?? true;
  }

  // --- public getters ---

  getCurrentState(): StateInterface {
    return this.currentState;
  }

  getLastState(): StateInterface | null {
    return this.lastState;
  }

  getSubject(): TSubject {
    return this.subject;
  }

  getProcess(): ProcessInterface {
    return this.process;
  }

  // --- public observer attach/detach ---

  attachBefore(observer: BeforeTransitionObserver<TSubject>): void {
    this.beforeObservers.push(observer);
  }

  detachBefore(observer: BeforeTransitionObserver<TSubject>): void {
    const idx = this.beforeObservers.indexOf(observer);
    if (idx >= 0) this.beforeObservers.splice(idx, 1);
  }

  getBeforeObservers(): Iterable<BeforeTransitionObserver<TSubject>> {
    return this.beforeObservers;
  }

  attachAfter(observer: AfterTransitionObserver<TSubject>): void {
    this.afterObservers.push(observer);
  }

  detachAfter(observer: AfterTransitionObserver<TSubject>): void {
    const idx = this.afterObservers.indexOf(observer);
    if (idx >= 0) this.afterObservers.splice(idx, 1);
  }

  getAfterObservers(): Iterable<AfterTransitionObserver<TSubject>> {
    return this.afterObservers;
  }

  // --- public locking ---

  async acquireLock(): Promise<boolean> {
    return this.mutex.acquireLock();
  }

  async releaseLock(): Promise<void> {
    await this.mutex.releaseLock();
  }

  isLockAcquired(): boolean {
    return this.mutex.isAcquired();
  }

  isAutoreleaseLock(): boolean {
    return this.autoreleaseLock;
  }

  setAutoreleaseLock(autorelease: boolean): void {
    this.autoreleaseLock = autorelease;
  }

  // --- public top-level operations ---

  triggerEvent(name: string, context?: Map<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.enqueue({
        kind: "triggerEvent",
        eventName: name,
        context: context ?? new Map(),
        resolve,
        reject,
      });
      void this.runIfIdle();
    });
  }

  checkTransitions(context?: Map<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.enqueue({
        kind: "checkTransitions",
        eventName: null,
        context: context ?? new Map(),
        resolve,
        reject,
      });
      void this.runIfIdle();
    });
  }

  // --- internal runner ---

  private async runIfIdle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.queue.isEmpty()) {
        const op = this.queue.dequeue()!;
        await this.runOperation(op);
      }
    } finally {
      this.running = false;
    }
  }

  private async runOperation(op: QueuedOperation): Promise<void> {
    // If the caller has already acquired the mutex (e.g. manual lock
    // management with autoreleaseLock: false), don't reacquire — many
    // mutex implementations (database advisory locks, redis SET NX, etc.)
    // are not idempotent and will fail on the second acquire. We only
    // release in this method if we acquired in this method.
    let acquiredHere = false;
    try {
      if (!this.mutex.isAcquired()) {
        if (!(await this.mutex.acquireLock())) {
          throw new LockCanNotBeAcquiredError("Lock can not be acquired!");
        }
        acquiredHere = true;
      }

      const event =
        op.kind === "triggerEvent" ? this.resolveEvent(op.eventName!) : null;

      await this.processOperation(event, op.context);
      op.resolve();
    } catch (err) {
      op.reject(err);
    } finally {
      if (acquiredHere && this.autoreleaseLock) {
        try {
          await this.mutex.releaseLock();
        } catch {
          // releaseLock errors must not mask the operation outcome.
        }
      }
    }
  }

  private resolveEvent(name: string): EventInterface {
    if (!this.currentState.hasEvent(name)) {
      throw new WrongEventForStateError(this.currentState.getName(), name);
    }
    return this.currentState.getEvent(name);
  }

  /**
   * Drive transitions starting from the current state, following automatic
   * transitions until quiescent. The first iteration may use the supplied
   * event; subsequent iterations are automatic.
   */
  private async processOperation(
    initialEvent: EventInterface | null,
    context: Map<string, unknown>,
  ): Promise<void> {
    let event = initialEvent;
    const automaticVisited = new Set<StateInterface>();

    // Fire event-attached observers (imperative commands attached via
    // event.attach()) when the user-supplied event is resolved, regardless
    // of whether a transition fires. Runs once per triggerEvent call —
    // automatic transitions in the iteration loop have event=null and don't
    // re-trigger this dispatch.
    if (event) {
      const dispatcher = new Dispatcher();
      dispatcher.dispatch(event, [this.subject, context]);
      await dispatcher.invoke();
    }

    while (true) {
      const transitions = this.currentState.getTransitions();
      const active = await ActiveTransitionFilter.filter(
        transitions,
        this.subject,
        context,
        event ?? undefined,
      );
      const selected = this.transitionSelector.selectTransition(
        active,
      ) as TransitionInterface<TSubject> | null;

      if (!selected) {
        return;
      }

      const target = selected.getTargetState();

      if (selected.getEventName() === null) {
        automaticVisited.add(this.currentState);
        if (automaticVisited.has(target)) {
          throw new AutomaticTransitionCycleError(
            target.getName(),
            Array.from(automaticVisited).map((s) => s.getName()),
          );
        }
      }

      if (this.currentState !== target) {
        const proposedFrame: ProposedTransitionFrame<TSubject> = Object.freeze({
          fromState: this.currentState,
          toState: target,
          transition: selected,
          event,
          condition: selected.getCondition(),
          context: this.readonlyContext(context),
          timestamp: Date.now(),
          machineName: this.process.getName(),
        });

        // Before phase — first observer to throw aborts.
        for (const observer of this.beforeObservers) {
          await observer.notify(proposedFrame);
        }

        // Commit.
        const fromState = this.currentState;
        this.lastState = fromState;
        this.currentState = target;

        const committedFrame: TransitionFrame<TSubject> = Object.freeze({
          fromState,
          toState: target,
          transition: selected,
          event,
          condition: selected.getCondition(),
          context: this.readonlyContext(context),
          timestamp: proposedFrame.timestamp,
          machineName: this.process.getName(),
        });

        // After phase — collect errors, notify all, then rethrow.
        const enqueueCtx: EnqueueContext = {
          enqueue: (chainedEventName, chainedCtx) => {
            this.queue.enqueue({
              kind: "triggerEvent",
              eventName: chainedEventName,
              context: chainedCtx ?? new Map(),
              resolve: () => {
                /* chained ops are not awaited by the original caller */
              },
              reject: () => {
                /* chained errors do not propagate to the original caller */
              },
            });
          },
        };

        const errors: unknown[] = [];
        for (const observer of this.afterObservers) {
          try {
            await observer.notify(committedFrame, enqueueCtx);
          } catch (err) {
            errors.push(err);
          }
        }
        if (errors.length === 1) {
          throw errors[0];
        }
        if (errors.length > 1) {
          throw new AggregateError(
            errors,
            `${errors.length} after-transition observer(s) threw`,
          );
        }
      }

      // Auto-follow-on: continue with no event.
      event = null;
    }
  }

  private readonlyContext(
    ctx: Map<string, unknown>,
  ): ReadonlyMap<string, unknown> {
    // Wrap to discourage mutation. We don't deep-freeze the values themselves —
    // keys removed from the wrapper map don't affect the underlying ctx, so
    // a thin wrapper suffices.
    return new Map(ctx);
  }
}
