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
import type { TransitionFrame } from "./interfaces/TransitionFrameInterface.js";
import type { StatemachineOptions } from "./interfaces/StatemachineOptions.js";
import { OneOrNoneActiveTransition } from "./selector/OneOrNoneActiveTransition.js";
import { NullMutex } from "./mutex/NullMutex.js";
import { OperationQueue } from "./internal/OperationQueue.js";
import type { QueuedOperation } from "./internal/OperationQueue.js";
import { ActiveTransitionFilter } from "./filter/ActiveTransitionFilter.js";
import { WrongEventForStateError } from "./error/WrongEventForStateError.js";
import { LockCanNotBeAcquiredError } from "./error/LockCanNotBeAcquiredError.js";
import { AutomaticTransitionCycleError } from "./error/AutomaticTransitionCycleError.js";
import { ReentrancyError } from "./error/ReentrancyError.js";

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
  private readonly maxAutomaticHops: number;

  private readonly queue = new OperationQueue();
  private running = false;
  private inSyncCallback = false;

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
    const hops = options.maxAutomaticHops ?? 100;
    if (!Number.isInteger(hops) || hops < 1) {
      throw new RangeError(
        `maxAutomaticHops must be a positive integer; got ${String(options.maxAutomaticHops)}`,
      );
    }
    this.maxAutomaticHops = hops;
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
      this.assertNotReentrant(`triggerEvent("${name}")`);
      this.enqueueOperation(name, context, resolve, reject);
    });
  }

  checkTransitions(context?: Map<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.assertNotReentrant("checkTransitions()");
      this.enqueueOperation(null, context, resolve, reject);
    });
  }

  /** Runs fn with the re-entrancy flag set for its SYNCHRONOUS portion only:
   *  the flag is cleared as soon as fn returns (before any promise it returned
   *  is awaited), so concurrent external callers are never affected. This
   *  catches triggerEvent/checkTransitions calls made before a callback's first
   *  await; calls made after a prior await are not detectable without
   *  AsyncLocalStorage (Node-only) and will still deadlock — a documented gap. */
  private guardSync<T>(fn: () => T): T {
    this.inSyncCallback = true;
    try {
      return fn();
    } finally {
      this.inSyncCallback = false;
    }
  }

  private assertNotReentrant(operation: string): void {
    if (this.inSyncCallback) {
      throw new ReentrancyError(operation);
    }
  }

  /** Single entry point to the operation queue — every enqueue kicks the runner. */
  private enqueueOperation(
    eventName: string | null,
    context: Map<string, unknown> | undefined,
    resolve: () => void,
    reject: (err: unknown) => void,
    ifStateName?: string,
  ): void {
    this.queue.enqueue({
      eventName,
      context: context ?? new Map(),
      ifStateName,
      resolve,
      reject,
    });
    void this.runIfIdle();
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
    if (
      op.ifStateName !== undefined &&
      this.currentState.getName() !== op.ifStateName
    ) {
      // Stale chained op — the machine moved on before it was dequeued.
      op.resolve();
      return;
    }

    // If the caller has already acquired the mutex (e.g. manual lock
    // management with autoreleaseLock: false), don't reacquire — many
    // mutex implementations (database advisory locks, redis SET NX, etc.)
    // are not idempotent and will fail on the second acquire. We only
    // release in this method if we acquired in this method.
    //
    // The caller's promise settles only AFTER the release completes, so
    // `await sm.triggerEvent(...)` guarantees the lock is free again.
    let acquiredHere = false;
    let failure: { err: unknown } | null = null;
    try {
      if (!this.mutex.isAcquired()) {
        if (!(await this.mutex.acquireLock())) {
          throw new LockCanNotBeAcquiredError("Lock can not be acquired!");
        }
        acquiredHere = true;
      }

      const event =
        op.eventName !== null ? this.resolveEvent(op.eventName) : null;

      await this.processOperation(event, op.context);
    } catch (err) {
      failure = { err };
    } finally {
      if (acquiredHere && this.autoreleaseLock) {
        try {
          await this.mutex.releaseLock();
        } catch {
          // releaseLock errors must not mask the operation outcome.
        }
      }
    }
    if (failure) {
      op.reject(failure.err);
    } else {
      op.resolve();
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
    let automaticHops = 0;

    // Fire event-attached observers (imperative commands attached via
    // event.attach()) when the user-supplied event is resolved, regardless
    // of whether a transition fires. Runs once per triggerEvent call —
    // automatic transitions in the iteration loop have event=null and don't
    // re-trigger this dispatch.
    if (event) {
      const userEvent = event; // const capture for the closure (event is a mutable let)
      await this.guardSync(() => userEvent.invoke(this.subject, context));
    }

    while (true) {
      const transitions = this.currentState.getTransitions();
      const active = await this.guardSync(() =>
        ActiveTransitionFilter.filter(
          transitions,
          this.subject,
          context,
          event ?? undefined,
        ),
      );
      const selected = this.transitionSelector.selectTransition(
        active,
      ) as TransitionInterface<TSubject> | null;

      if (!selected) {
        return;
      }

      const target = selected.getTargetState();

      if (selected.getEventName() === null) {
        automaticHops += 1;
        if (automaticHops > this.maxAutomaticHops) {
          throw new AutomaticTransitionCycleError(
            target.getName(),
            this.maxAutomaticHops,
          );
        }
      }

      if (this.currentState !== target) {
        const frame: TransitionFrame<TSubject> = Object.freeze({
          subject: this.subject,
          fromState: this.currentState,
          toState: target,
          transition: selected,
          event,
          condition: selected.getCondition(),
          context: this.readonlyContext(context),
          timestamp: Date.now(),
          machineName: this.process.getName(),
        });

        // Before phase — first observer to throw aborts. Iterate a snapshot
        // so observers that detach (themselves or others) during notify
        // can't shift the live array under the iterator.
        for (const observer of [...this.beforeObservers]) {
          await this.guardSync(() => observer.notify(frame));
        }

        // Commit.
        this.lastState = this.currentState;
        this.currentState = target;

        // After phase — collect errors, notify all, then rethrow.
        const enqueueCtx: EnqueueContext = {
          enqueue: (chainedEventName, chainedCtx, ifStateName) => {
            this.enqueueOperation(
              chainedEventName,
              chainedCtx,
              () => {
                /* chained ops are not awaited by the original caller */
              },
              () => {
                /* chained errors do not propagate to the original caller */
              },
              ifStateName,
            );
          },
        };

        const errors: unknown[] = [];
        for (const observer of [...this.afterObservers]) {
          try {
            await this.guardSync(() => observer.notify(frame, enqueueCtx));
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
