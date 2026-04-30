# v3 Execution Model & Process Graph Redesign

**Status:** approved (design phase)
**Date:** 2026-04-30
**Target version:** `@camcima/finita` v3.0.0
**Source review:** `IMPLEMENTATION_REVIEW.md` (2026-04-30) — findings #1, #2, #3, #4 (with partial coverage of #5, #6)

## Goals

Address the architectural correctness issues identified in the implementation review:

- **#1** Concurrent operations on the same `Statemachine` instance can interleave and lose transitions (`checkTransitions` and `triggerEvent` are not mutually serialized; `acquireLock()` short-circuits on already-held mutex).
- **#2** `OnEnterObserver` corrupts observer context for observers registered after it, because it reenters the FSM during notification while transient instance fields are mutated.
- **#3** `Process` is documented as immutable but `State` instances retained by it remain mutable, so a state machine can transition into a state outside `process.getStates()`.
- **#4** Transition failure semantics are partially transactional: `currentState` is committed before state-machine observers run, and a thrown observer leaves state advanced. This is undocumented.

The redesign does this in a single `v3.0.0` release. Breaking changes are explicit; a migration guide accompanies the release.

## Non-goals

- Distributed FSM coordination beyond what the existing `MutexInterface` already supports.
- Persistence-layer rollback or compensating transitions.
- Hierarchical / orthogonal sub-state machines.
- Performance work; correctness comes first.

## Design decisions

The design rests on five decisions, each chosen during brainstorming:

| #   | Decision                                                                  | Rationale                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **v3 major version**, breaking changes allowed                            | The fixes for #1, #2, #3 require contract changes that cannot be expressed compatibly.                                                                                                                                 |
| 2   | **Queue-then-drain reentrancy** for observers                             | Observers cannot call `triggerEvent`/`checkTransitions` inline; they enqueue. Each top-level call runs to completion before the next starts. Simple, deterministic, testable.                                          |
| 3   | **Per-instance FIFO queue + cross-process mutex**                         | Same-instance correctness comes from the queue; cross-process correctness comes from the existing `MutexInterface`. They are orthogonal.                                                                               |
| 4   | **Two-phase observer lifecycle** (`beforeTransition` / `afterTransition`) | Cleanly separates "validate or veto" from "react or log". Replaces today's pre/post-transition split that was implicit in observer placement.                                                                          |
| 5   | **Explicit `ProcessBuilder`** with frozen output                          | Eliminates post-finalize mutation of states; provides a single entry point for graph validation; closes #3 and is the natural place to also close #5 (empty event names) and #6 (duplicate-with-conflict transitions). |

## Architecture

### 1. Components

- **`ProcessBuilder`** — fluent graph builder. Validates the graph and produces a frozen `Process`.
- **`Process`** _(frozen, internally constructed)_ — read-only graph descriptor. Methods: `getName`, `getInitialState`, `getStates`, `getState`, `hasState`. No mutation API.
- **`State`** _(frozen, internal)_ — read-only state descriptor. Methods: `getName`, `getTransitions`, `getEventNames`, `hasEvent`, `getEvent`, `getMetadata`, `getMetadataValue`, `hasMetadataValue`. **No public constructor; no mutators.** Constructed only by the builder.
- **`Transition`** _(frozen, internal)_ — read-only transition descriptor. Methods: `getTargetState`, `getEventName`, `getCondition`, `getConditionName`, `getWeight`, `isActive`. **No public constructor; no mutators.**
- **`TransitionFrame`** _(immutable observer payload)_ — passed to observers in lieu of pulling fields off the `Statemachine`. Shape:
  ```ts
  interface TransitionFrame<TSubject = unknown> {
    readonly fromState: StateInterface;
    readonly toState: StateInterface;
    readonly transition: TransitionInterface<TSubject>;
    readonly event: EventInterface | null;
    readonly condition: ConditionInterface<TSubject> | null;
    readonly context: ReadonlyMap<string, unknown>;
    readonly timestamp: number;
    readonly machineName: string | null;
  }
  ```
  `ProposedTransitionFrame` is the same shape, distinguished only by phase. The `context` is wrapped read-only when handed to observers.
- **`Statemachine`** — the execution engine. Owns:
  - The injected `subject`, `process`, `transitionSelector`, `mutex`.
  - `currentState` and `lastState` (committed values; mutated only at commit time).
  - A per-instance FIFO operation queue.
  - Two ordered observer registries: `beforeTransition` and `afterTransition`.
- **Observer interfaces:**

  ```ts
  interface BeforeTransitionObserver<TSubject = unknown> {
    notify(frame: ProposedTransitionFrame<TSubject>): MaybePromise<void>;
  }

  interface AfterTransitionObserver<TSubject = unknown> {
    notify(
      frame: TransitionFrame<TSubject>,
      ctx: { enqueue(event: string, context?: Map<string, unknown>): void },
    ): MaybePromise<void>;
  }
  ```

  `enqueue` appends to the FSM's queue and never runs inline.

### 2. Execution flow (one top-level operation)

A "top-level operation" is one external `triggerEvent` or `checkTransitions` call, or one `enqueue(...)` from an `AfterTransitionObserver`. The engine runs operations strictly one at a time per instance.

1. **Enqueue + acquire.** Append the operation (kind, name, context, deferred resolver) to the FIFO queue. If the engine is idle, `await mutex.acquireLock()`. If acquisition fails, reject with `LockCanNotBeAcquiredError` (current behavior preserved). Otherwise begin processing.
2. **Resolve transitions.** Build candidate transitions for `currentState`, filtered by event identity if any. Run conditions. Run selector.
3. **Propose.** If a transition was selected and `from !== to`, build a `ProposedTransitionFrame`. (Self-transitions where `from === to` skip steps 4–6 and proceed to auto-follow-on; behavior matches today's "skip notification when target equals current".)
4. **Before phase.** Iterate `beforeTransition` observers in registration order, awaiting each. Any throw aborts the operation: state stays at `fromState`, the original caller's promise rejects with the thrown error wrapped (cause preserved) by the existing transition-error envelope.
5. **Commit.** Atomically: set `lastState = fromState`, `currentState = toState`. Stamp `timestamp = Date.now()`. Freeze the resulting `TransitionFrame`.
6. **After phase.** Iterate `afterTransition` observers in registration order, passing `(frame, ctx)`. Errors thrown by an after-observer are collected; _all_ after-observers are still invoked (no early bail). After the loop: if exactly one error was collected, it is rethrown directly to the caller; if more than one, the caller is rejected with a standard `AggregateError` whose `errors` array contains the thrown errors in invocation order. State remains at `toState`; no rollback.
7. **Auto-follow-on.** If `currentState` has active automatic (no-event) transitions, loop to step 2 _within the same operation_. Cycle detection (the existing `automaticVisited` set, or its successor) is retained.
8. **Drain.** Operation completes; resolve or reject the caller's promise. If `autoreleaseLock` is true, `await mutex.releaseLock()`. Then dequeue the next operation (which includes anything that `AfterTransitionObserver`s enqueued during step 6) and run from step 1's "acquire". Each top-level operation acquires and releases the mutex independently — chained events do not share an acquisition with their parent.

External same-instance callers serialize through the queue. Cross-process callers serialize through `MutexInterface`. Observers do not reenter — they only enqueue.

### 3. Frames replace mutable observer context

The following `Statemachine` instance fields, which today double as observer-visible state, are removed from the public/observable surface: `dispatcher`, `currentContext`, `currentEvent`, `selectedTransition`, `lastState`-as-observer-context-snapshot.

- `dispatcher` and `currentEvent` become local variables of the operation runner.
- `currentContext` becomes a local variable of the operation runner; observers read it from their frame.
- `selectedTransition` becomes a local variable; observers read it from their frame.
- `lastState` is retained as a public getter (`sm.getLastState()`) returning the committed predecessor of the _current_ state. It is no longer cleared between phases (today, it's set during notification and cleared in `finally`, which is itself a bug). Reading `lastState` outside an observer is well-defined: it's the predecessor of `currentState`.
- `currentEvent`, `currentContext`, `selectedTransition` getters on `Statemachine` are **removed**. Observers obtain these from their frame parameter; non-observer callers had no well-defined moment to read them anyway.

### 4. Locking changes

- **Remove** the `if (this.mutex.isAcquired()) return true;` short-circuit in `acquireLock()`. The engine holds the mutex for exactly one top-level operation and never re-enters acquisition during nested logic, because nested logic is not allowed (queue-then-drain).
- The contract of `MutexInterface` is unchanged: `acquireLock(): Promise<boolean>`, `releaseLock(): Promise<void>`, `isAcquired(): boolean`. `isAcquired()` remains useful for the engine's `autoreleaseLock` decision and for adapter introspection, but the engine no longer relies on it for correctness.
- The constructor's `setAutoreleaseLock(false)` use case (currently exploited by `OnEnterObserver`) is preserved for advanced users who want a single mutex acquisition across multiple top-level operations, but the canonical pattern is "one operation, one acquisition".

### 5. Transaction semantics

Documented contract (replaces today's implicit behavior):

- `BeforeTransitionObserver.notify` runs against the proposed frame. **Throwing aborts the transition.** State is not mutated. Caller rejects with the thrown error (wrapped by the existing transition-error envelope; original error preserved as `cause`).
- `AfterTransitionObserver.notify` runs against the committed frame. **Throwing does not roll back state.** All after-observers are invoked before the caller is rejected; if exactly one threw, the caller receives that error directly; if more than one threw, the caller receives a standard `AggregateError` containing all thrown errors in invocation order.
- The mutex is held for the full operation (before + commit + after + auto-follow-on). Other in-process callers wait their turn in the queue regardless of the mutex.

This gives users a clean "veto on validation failure / react on commit / acknowledge errors but don't rewind state" model. Persistence-correctness (e.g., committing an external DB row before allowing the transition) is the user's responsibility and belongs in `BeforeTransitionObserver`.

## Public API

### Building a process

```ts
import { ProcessBuilder } from "@camcima/finita";

const process = new ProcessBuilder("orderFulfillment")
  .addState("draft", { initial: true })
  .addState("submitted")
  .addState("paid")
  .addState("shipped")
  .addTransition("draft", "submitted", { event: "submit" })
  .addTransition("submitted", "paid", {
    event: "pay",
    condition: hasPaymentMethod,
  })
  .addTransition("paid", "shipped", { event: "ship" })
  .build();
```

`ProcessBuilder` API (final names subject to implementation-plan refinement):

```ts
class ProcessBuilder {
  constructor(name: string);
  addState(
    name: string,
    options?: { initial?: boolean; metadata?: Record<string, unknown> },
  ): this;
  addTransition(
    fromState: string,
    toState: string,
    options?: {
      event?: string;
      condition?: ConditionInterface<TSubject>;
      weight?: number;
    },
  ): this;
  build(options?: { warnOnOrphans?: boolean }): Process;
}
```

`build()` is a one-shot terminal method. Calling it twice on the same builder throws `ProcessFinalizedError`. The returned `Process` is frozen.

### Build-time validations

`ProcessBuilder.build()` raises typed errors for:

- **Unknown target state:** a transition references a `toState` (or `fromState`) that was not added with `addState`. → `GraphValidationError`.
- **Empty/whitespace event name:** `event` provided but is `""` or whitespace. → `GraphValidationError` (closes #5).
- **Duplicate-with-conflict transitions:** two `(fromState, event, toState)` triples are declared with different condition objects (different identity _and_ different `getName()`). → `DuplicateTransitionError` (closes #6 silent-drop). Two declarations with the same `(fromState, event, toState, conditionName)` are permitted and deduplicated as today.
- **No initial state declared:** no `addState(_, { initial: true })` before `build()`. → `GraphValidationError`.
- **Multiple initial states:** more than one state declared with `initial: true`. → `GraphValidationError`.
- **Orphan/unreachable states:** by default, log a warning via the host's standard mechanism (TBD in implementation; likely just a warning array on a returned diagnostics handle). Configurable to throw via `build({ warnOnOrphans: false })` reinterpreted as strict — exact flag spelling decided in implementation.

Static automatic-cycle detection is **out of scope** for the builder; the existing runtime cycle detector remains the authority. (Some cycles are decidable statically, but the conditions on transitions can make them runtime-only; we do not split this into two enforcement layers.)

### Running a machine

```ts
import { Statemachine, OnEnterObserver } from "@camcima/finita";

const sm = new Statemachine(subject, process, {
  initialStateName, // optional; defaults to process.getInitialState()
  transitionSelector, // optional; defaults to OneOrNoneActiveTransition
  mutex, // optional; defaults to NullMutex
  autoreleaseLock: true, // optional; defaults to true
});

sm.attachBefore(validatorObserver);
sm.attachAfter(loggerObserver);
sm.attachAfter(new OnEnterObserver());

await sm.triggerEvent("submit", new Map([["actor", userId]]));
```

`Statemachine` constructor and observer-attachment changes:

- Constructor takes `(subject, process, options?)` instead of trailing positionals.
- `attach(observer)` is replaced by `attachBefore(observer)` and `attachAfter(observer)`. Likewise `detach` becomes `detachBefore`/`detachAfter`.
- `getObservers()` is replaced by `getBeforeObservers()` and `getAfterObservers()`.
- `getCurrentState()`, `getLastState()`, `getProcess()`, `getSubject()`, `triggerEvent()`, `checkTransitions()`, `acquireLock()`, `releaseLock()`, `isLockAcquired()`, `isAutoreleaseLock()`, `setAutoreleaseLock()` are retained.
- `getSelectedTransition()`, `getCurrentContext()` are **removed** from the public surface. `dispatchEvent` (the lower-level entry point) is **removed** from the public surface; `triggerEvent` is the sole external entry point. `Dispatcher` becomes an internal detail.

### Reborn `OnEnterObserver`

```ts
class OnEnterObserver<
  TSubject = unknown,
> implements AfterTransitionObserver<TSubject> {
  static readonly DEFAULT_EVENT_NAME = "onEnter";
  constructor(eventName: string = OnEnterObserver.DEFAULT_EVENT_NAME);
  notify(frame: TransitionFrame<TSubject>, { enqueue }): void {
    if (frame.toState.hasEvent(this.eventName)) {
      // Convert the read-only frame.context back to a mutable Map for the next op.
      enqueue(this.eventName, new Map(frame.context));
    }
  }
}
```

The behavioral difference from v2: chained on-enter events run _after_ the current top-level operation completes, not inside its observer notification. Other after-observers registered after `OnEnterObserver` therefore see the original frame, not the chained one — which is the fix for #2. The chained event runs as its own top-level operation, with its own observer notifications.

### Error classes

| Class                       | Status   | Notes                                                                                                              |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `WrongEventForStateError`   | retained | unchanged                                                                                                          |
| `LockCanNotBeAcquiredError` | retained | unchanged                                                                                                          |
| `DuplicateStateError`       | retained | repurposed for builder duplicate `addState`                                                                        |
| `ProcessFinalizedError`     | new      | thrown when `ProcessBuilder.build()` is called twice                                                               |
| `GraphValidationError`      | new      | thrown by `build()` for unknown targets, missing/duplicate initial state, empty event names, orphans (when strict) |
| `DuplicateTransitionError`  | new      | thrown by `build()` when two `(from, event, to)` triples have conflicting conditions                               |

## Migration (v2 → v3)

The migration guide will live at `docs/migration/v2-to-v3.md` and ships with the v3.0.0 release. Mechanical rewrites in summary:

- `new State("foo")` + `new Transition(...)` + `state.addTransition(...)` + `new Process("name", initial)` → one `ProcessBuilder` chain.
- `class Foo implements Observer { update(subject) {...} }` → one of `BeforeTransitionObserver` or `AfterTransitionObserver`. Move logic that pulls `subject.getCurrentState()`/`getSelectedTransition()`/etc. to read from the frame parameter. If the observer needs the `Statemachine` itself (e.g., to call other public methods), close over it via constructor injection rather than receiving it as a parameter.
- `sm.attach(o)` → `sm.attachBefore(o)` or `sm.attachAfter(o)`. The split is determined by what phase the observer's logic belongs to:
  - Vetoes / validation / pre-commit external writes → `before`.
  - Logging / metrics / chained events / post-commit external sync → `after`.
- `OnEnterObserver` keeps its name and its `eventName` constructor argument, but its semantic timing changes (see above). Tests that asserted "observers registered after `OnEnterObserver` see the chained transition" must be updated.
- `new Statemachine(subject, process, stateName, selector, mutex)` → `new Statemachine(subject, process, { initialStateName, transitionSelector, mutex, autoreleaseLock })`.
- Reads of `sm.getSelectedTransition()` / `sm.getCurrentContext()` outside an observer callback are removed; rewrite to subscribe to an after-observer.

The migration guide will include a "before / after" example for each item above and call out that re-running the test suite is the safest verification.

## Testing

Regression suites added to close each finding. (Listed by intent; concrete file/test naming is deferred to the implementation plan.)

| Finding | Regression test                                                                                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1      | Concurrent `triggerEvent` and `checkTransitions` on same instance: the second op runs _after_ the first completes (assertable via observer call order and final state); both produce correct final states; cross-process mutex is acquired exactly once per top-level operation. |
| #1      | `acquireLock` no longer short-circuits on `isAcquired()`: a `MutexInterface` whose `isAcquired()` returns true but `acquireLock()` returns false will cause the operation to fail loudly.                                                                                        |
| #2      | `OnEnterObserver` registered before another after-observer: the second after-observer receives the original frame (not the chained event's frame); the chained event runs as a separate top-level operation afterwards.                                                          |
| #2      | On-enter event that targets a third state: the after-observers for the _first_ transition all see the first frame; the on-enter chain runs after; observers for the chained op see the chained frame.                                                                            |
| #3      | After `ProcessBuilder.build()`, `Process` is frozen; `State` and `Transition` instances obtained from it have no public mutators (compile-time and/or runtime check).                                                                                                            |
| #3      | A second `build()` on the same builder throws `ProcessFinalizedError`.                                                                                                                                                                                                           |
| #4      | Throwing `BeforeTransitionObserver`: state stays at `fromState`; caller rejects; no after-observer is invoked.                                                                                                                                                                   |
| #4      | Throwing `AfterTransitionObserver`: state is at `toState`; all subsequent after-observers are still invoked; caller receives the single error directly if only one threw, otherwise an `AggregateError`.                                                                         |
| #5      | `ProcessBuilder.addTransition({ event: "" })` raises `GraphValidationError` at `build()`.                                                                                                                                                                                        |
| #6      | Two `addTransition` calls with the same `(from, event, to)` and different condition objects raise `DuplicateTransitionError` at `build()`.                                                                                                                                       |

Existing test suites that assert behaviors changed by this redesign (transitive observer ordering, post-finalize mutation, `isAcquired()` short-circuit) are updated as part of the implementation. The test plan target is "no green test in v2 turns red silently in v3" — every removed/changed assertion is replaced with the new contract's equivalent.

## Out of scope (for this spec)

These items appear in the same review and will be addressed by separate specs:

- **Sub-project C** — API hardening & validation: findings #5 (broader empty/whitespace input validation beyond builder), #12 (more error classes for runtime-detected failures), #13 (tightened type guards on observer extension points), #14 (`GraphBuilder` edge dedup).
- **Sub-project D** — Release packaging hardening: finding #7 (`prepack`/`prepublishOnly`, `dist` checked-in vs built fresh, lefthook side effect from `prepare`).
- **Sub-project E** — Documentation alignment: findings #8, #9, #10, #11 (including the unsafe SQL example).

## Implementation phasing

This spec describes the target end-state. The implementation plan (next document, produced by writing-plans) will sequence the work; expected high-level phases:

1. Introduce frames, two-phase observers, and the queue inside `Statemachine` _behind_ the existing public API where possible, with a feature-flag/internal switch to verify behavior on the existing test suite (where compatible).
2. Land `ProcessBuilder` and freeze `State` / `Transition` / `Process`.
3. Switch the public `Statemachine` constructor and observer attachment to the v3 shape; remove the deprecated surface.
4. Update tests and docs; write migration guide.
5. Release v3.0.0.

The implementation plan owns the exact sequencing.
