# v3 Execution Model & Graph Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `@camcima/finita` v3.0.0 — a breaking-change release that fixes the architectural correctness issues from `IMPLEMENTATION_REVIEW.md` (findings #1, #2, #3, #4 with partial coverage of #5, #6) by introducing immutable transition frames, a per-instance FIFO operation queue, a two-phase observer lifecycle, and an explicit `ProcessBuilder` for frozen graph construction.

**Architecture:** Graph construction is routed through `ProcessBuilder`, which produces frozen `Process`/`State`/`Transition` instances. The `Statemachine` runs one top-level operation at a time through a FIFO queue layered on top of the existing `MutexInterface`; observers are split into `BeforeTransitionObserver` (may veto) and `AfterTransitionObserver` (post-commit, may enqueue chained events but never reenters). Mutable observer-context fields on the `Statemachine` are replaced by an immutable `TransitionFrame` passed to each observer.

**Tech Stack:** TypeScript 6.x, ESM, vitest, tsup, pnpm. Existing dependencies unchanged.

**Source spec:** `docs/superpowers/specs/2026-04-30-execution-and-graph-redesign.md`.

**Out of scope (deferred to other sub-projects):** broader API hardening (Sub-project C), release packaging (D), documentation drift (E), `SetupHelper`/`StateCollectionMerger` re-implementation (removed in v3 with a migration note; can be re-added on top of `ProcessBuilder` later).

---

## File Structure

### New source files

| Path                                                  | Responsibility                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/error/ProcessFinalizedError.ts`                  | Thrown when `ProcessBuilder.build()` is called more than once on the same builder.                                                           |
| `src/error/GraphValidationError.ts`                   | Thrown by `ProcessBuilder.build()` for unknown targets, missing/duplicate initial states, empty event names, orphans (when strict).          |
| `src/error/DuplicateTransitionError.ts`               | Thrown by `ProcessBuilder.build()` when two `(from, event, to)` triples have conflicting condition objects.                                  |
| `src/interfaces/TransitionFrameInterface.ts`          | `TransitionFrame` and `ProposedTransitionFrame` interfaces (immutable observer payloads).                                                    |
| `src/interfaces/BeforeTransitionObserverInterface.ts` | `BeforeTransitionObserver` interface.                                                                                                        |
| `src/interfaces/AfterTransitionObserverInterface.ts`  | `AfterTransitionObserver` interface. `EnqueueContext` shape.                                                                                 |
| `src/interfaces/StatemachineOptions.ts`               | `StatemachineOptions` type for the new options-object constructor.                                                                           |
| `src/ProcessBuilder.ts`                               | Public builder class — collects states, transitions, validates, freezes, returns `Process`.                                                  |
| `src/internal/OperationQueue.ts`                      | Internal FIFO queue holding pending top-level operations and their deferred resolvers.                                                       |
| `src/internal/InternalConstruction.ts`                | Internal symbol used as a "construction key" for `State`, `Transition`, `Process` constructors so they can only be invoked from the builder. |

### New test files

| Path                            | Responsibility                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tests/process-builder.test.ts` | All `ProcessBuilder` validation and freeze-after-build tests; closes #3, #5, #6.                                          |
| `tests/concurrency.test.ts`     | Same-instance serialization, queue ordering, mutex acquire-once-per-op; closes #1.                                        |
| `tests/observer-frame.test.ts`  | Two-phase observer ordering, `OnEnterObserver` queueing, frame immutability, multi-error `AggregateError`; closes #2, #4. |

### Modified source files

| Path                                      | Change                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/Statemachine.ts`                     | Full rewrite around the FIFO queue, two-phase observers, frame-based notification, and options-object constructor.                                                                                                                                                                  |
| `src/Process.ts`                          | `Process` becomes built only by `ProcessBuilder` via the internal construction key. Public constructor removed. Frozen on creation.                                                                                                                                                 |
| `src/State.ts`                            | Same — no public constructor, no mutators. Built only by `ProcessBuilder`. Frozen.                                                                                                                                                                                                  |
| `src/Transition.ts`                       | Same — no public constructor, no mutators. Frozen.                                                                                                                                                                                                                                  |
| `src/StateCollection.ts`                  | Reduced to an internal frozen view; no `addState` exposed publicly. (StateCollection's only consumer in v3 is `Process`.)                                                                                                                                                           |
| `src/Dispatcher.ts`                       | Becomes internal — moved to `src/internal/Dispatcher.ts`; removed from public exports.                                                                                                                                                                                              |
| `src/index.ts`                            | Updated public exports (add `ProcessBuilder`, `BeforeTransitionObserver`, `AfterTransitionObserver`, new errors; remove `State`, `Transition`, `Process` constructors, `StateCollection`, `Dispatcher`, `SetupHelper`, `StateCollectionMerger`, legacy `Observer` from SM context). |
| `src/interfaces/StatemachineInterface.ts` | New contract — `attachBefore`/`attachAfter`, no mutable observer-context getters, no longer extends `ObservableSubject`.                                                                                                                                                            |
| `src/interfaces/StateInterface.ts`        | Mutators (`addTransition`, `setMetadataValue`, `deleteMetadataValue`) removed.                                                                                                                                                                                                      |
| `src/interfaces/Observer.ts`              | Kept for `Event` observers (commands). `ObservableSubject` no longer used by `Statemachine`.                                                                                                                                                                                        |
| `src/observer/OnEnterObserver.ts`         | Re-implemented as `AfterTransitionObserver` that enqueues (no inline reentrancy).                                                                                                                                                                                                   |
| `src/observer/TransitionLogger.ts`        | Re-implemented as `AfterTransitionObserver` reading from frame.                                                                                                                                                                                                                     |
| `src/observer/StatefulStatusChanger.ts`   | Re-implemented as `AfterTransitionObserver` reading from frame.                                                                                                                                                                                                                     |
| `src/observer/CallbackObserver.ts`        | Restricted to `Event` (command) usage — `Observer` interface unchanged.                                                                                                                                                                                                             |
| `src/factory/Factory.ts`                  | Uses options-object `Statemachine` constructor; observers are re-typed as `AfterTransitionObserver` (and optionally `BeforeTransitionObserver`).                                                                                                                                    |
| `src/util/SetupHelper.ts`                 | **Removed** from v3 (migration note in guide).                                                                                                                                                                                                                                      |
| `src/util/StateCollectionMerger.ts`       | **Removed** from v3 (migration note in guide).                                                                                                                                                                                                                                      |
| `src/util/index.ts`                       | Updated to no longer export the removed utilities.                                                                                                                                                                                                                                  |
| `package.json`                            | Version bumped to `3.0.0`.                                                                                                                                                                                                                                                          |

### Modified test files

All test files are updated to the v3 API. Concretely:

| Path                                                                                                                         | Change                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/core.test.ts`                                                                                                         | Replace direct construction of `State`/`Transition`/`Process` with `ProcessBuilder`. Replace `Statemachine` positional constructor with options object. Replace `attach`/`Observer.update` with `attachAfter`/`AfterTransitionObserver`. Drop assertions on removed getters (`getSelectedTransition`, `getCurrentContext`). |
| `tests/exception-cleanup.test.ts`                                                                                            | Same conversion. Tests for "transient fields cleared after throw" are replaced with frame-based equivalents (`AfterTransitionObserver` receives a frame; throwing it does not roll back state).                                                                                                                             |
| `tests/observer.test.ts`                                                                                                     | Conversion + new assertions about queue-driven `OnEnterObserver`. Tests that asserted observers see chained transitions are updated to assert they see the original frame and the chained event runs as a separate op.                                                                                                      |
| `tests/factory.test.ts`                                                                                                      | Use options-object constructor in expectations. Update observer typing.                                                                                                                                                                                                                                                     |
| `tests/integration.test.ts`                                                                                                  | End-to-end conversion to `ProcessBuilder` + new observer interfaces.                                                                                                                                                                                                                                                        |
| `tests/mutex.test.ts`                                                                                                        | Update for "no `isAcquired()` short-circuit" — adapter that returns `true` from `isAcquired()` but `false` from `acquireLock()` causes the operation to fail.                                                                                                                                                               |
| `tests/util.test.ts`                                                                                                         | **Deleted** alongside `SetupHelper`/`StateCollectionMerger`.                                                                                                                                                                                                                                                                |
| `tests/error.test.ts`                                                                                                        | Add cases for new error classes; preserve existing.                                                                                                                                                                                                                                                                         |
| `tests/condition.test.ts`, `tests/filter.test.ts`, `tests/selector.test.ts`, `tests/generics.test.ts`, `tests/graph.test.ts` | Mechanical conversion to `ProcessBuilder`; semantics unchanged.                                                                                                                                                                                                                                                             |

### Modified docs

| Path                                                                                                                                                                           | Change                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/core.md`                                                                                                                                                                 | Examples rewritten to use `ProcessBuilder` and the v3 `Statemachine` constructor. Document the two-phase observer lifecycle and queue-then-drain semantics. |
| `docs/observers.md`                                                                                                                                                            | Replace `Observer.update(subject)` with `BeforeTransitionObserver`/`AfterTransitionObserver`; document frames and `enqueue`.                                |
| `docs/conditions.md`, `docs/filters.md`, `docs/selectors.md`, `docs/factory.md`, `docs/mutex.md`, `docs/graph.md`, `docs/utilities.md`, `docs/errors.md`, `docs/interfaces.md` | Mechanical conversion of code examples to v3 API.                                                                                                           |
| `docs/migration/v2-to-v3.md`                                                                                                                                                   | **New.** Migration guide.                                                                                                                                   |
| `README.md`                                                                                                                                                                    | Quick-start updated to v3.                                                                                                                                  |

---

## Execution Order

The plan is organized into seven phases. Each phase ends at a green test suite and a commit. Some phases contain breaking changes that won't compile until the _whole phase_ is complete — this is called out per task and the tasks within such a phase should be implemented in sequence before running tests.

- **Phase 1** — Add new types (additive, non-breaking). Compiles after each task.
- **Phase 2** — `ProcessBuilder` and frozen graph. Breaks user-constructible `State`/`Transition`/`Process`. Tests don't compile mid-phase.
- **Phase 3** — `Statemachine` execution rewrite. Breaks observer attach/notify and constructor.
- **Phase 4** — Built-in observers re-implementation.
- **Phase 5** — Dependent-module migration (`Factory`, removal of `SetupHelper`/`StateCollectionMerger`).
- **Phase 6** — Test conversion and regression suites.
- **Phase 7** — Documentation, migration guide, version bump.

---

# Phase 1 — Additive Foundations

This phase adds new error classes and interfaces without breaking anything. Each task ends with a green build and a commit.

## Task 1.1: New error class — `ProcessFinalizedError`

**Files:**

- Create: `src/error/ProcessFinalizedError.ts`
- Create: `tests/error.test.ts` (modify if exists; otherwise this task adds new cases)
- Modify: `src/error/index.ts`

- [ ] **Step 1: Write failing test**

Add or extend `tests/error.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ProcessFinalizedError } from "../src/index.js";

describe("ProcessFinalizedError", () => {
  it("captures the builder name and is an Error", () => {
    const err = new ProcessFinalizedError("orderFulfillment");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProcessFinalizedError");
    expect(err.processName).toBe("orderFulfillment");
    expect(err.message).toContain("orderFulfillment");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
pnpm vitest run tests/error.test.ts -t "ProcessFinalizedError"
```

Expected: import error / class not exported.

- [ ] **Step 3: Implement `ProcessFinalizedError`**

Write `src/error/ProcessFinalizedError.ts`:

```ts
export class ProcessFinalizedError extends Error {
  readonly processName: string;

  constructor(processName: string) {
    super(
      `Process "${processName}" has already been built; ProcessBuilder.build() may only be called once`,
    );
    this.name = "ProcessFinalizedError";
    this.processName = processName;
  }
}
```

- [ ] **Step 4: Re-export from `src/error/index.ts`**

Read the existing file and add the line:

```ts
export { ProcessFinalizedError } from "./ProcessFinalizedError.js";
```

(Insert in alphabetical order with the other re-exports.)

- [ ] **Step 5: Re-export from `src/index.ts`**

In the errors block at the bottom of `src/index.ts`, add `ProcessFinalizedError` to the export list:

```ts
export {
  WrongEventForStateError,
  LockCanNotBeAcquiredError,
  DuplicateStateError,
  ProcessFinalizedError,
} from "./error/index.js";
```

- [ ] **Step 6: Run the test to verify it passes**

```
pnpm vitest run tests/error.test.ts -t "ProcessFinalizedError"
```

Expected: PASS.

- [ ] **Step 7: Run full lint**

```
pnpm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/error/ProcessFinalizedError.ts src/error/index.ts src/index.ts tests/error.test.ts
git commit -m "feat(error): add ProcessFinalizedError"
```

---

## Task 1.2: New error class — `GraphValidationError`

**Files:**

- Create: `src/error/GraphValidationError.ts`
- Modify: `src/error/index.ts`, `src/index.ts`, `tests/error.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/error.test.ts`:

```ts
import { GraphValidationError } from "../src/index.js";

describe("GraphValidationError", () => {
  it("captures violation details", () => {
    const err = new GraphValidationError(
      "unknownTarget",
      `Transition target "x" was not declared as a state`,
      { fromState: "a", toState: "x" },
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GraphValidationError");
    expect(err.code).toBe("unknownTarget");
    expect(err.message).toContain("unknownTarget");
    expect(err.message).toContain('"x"');
    expect(err.details).toEqual({ fromState: "a", toState: "x" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
pnpm vitest run tests/error.test.ts -t "GraphValidationError"
```

Expected: import error.

- [ ] **Step 3: Implement `GraphValidationError`**

Write `src/error/GraphValidationError.ts`:

```ts
export type GraphValidationCode =
  | "unknownTarget"
  | "unknownSource"
  | "missingInitialState"
  | "multipleInitialStates"
  | "emptyEventName"
  | "orphanState";

export class GraphValidationError extends Error {
  readonly code: GraphValidationCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: GraphValidationCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(`[${code}] ${message}`);
    this.name = "GraphValidationError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
```

- [ ] **Step 4: Wire re-exports**

Add to `src/error/index.ts`:

```ts
export { GraphValidationError } from "./GraphValidationError.js";
export type { GraphValidationCode } from "./GraphValidationError.js";
```

Add `GraphValidationError` to the errors block of `src/index.ts`. Also export the type:

```ts
export type { GraphValidationCode } from "./error/index.js";
```

- [ ] **Step 5: Verify**

```
pnpm vitest run tests/error.test.ts -t "GraphValidationError" && pnpm run lint
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/error/GraphValidationError.ts src/error/index.ts src/index.ts tests/error.test.ts
git commit -m "feat(error): add GraphValidationError with typed code"
```

---

## Task 1.3: New error class — `DuplicateTransitionError`

**Files:**

- Create: `src/error/DuplicateTransitionError.ts`
- Modify: `src/error/index.ts`, `src/index.ts`, `tests/error.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/error.test.ts`:

```ts
import { DuplicateTransitionError } from "../src/index.js";

describe("DuplicateTransitionError", () => {
  it("captures conflict descriptors", () => {
    const err = new DuplicateTransitionError({
      fromState: "draft",
      toState: "submitted",
      eventName: "submit",
      existingConditionName: "hasItems",
      newConditionName: "isAuthorised",
    });
    expect(err.name).toBe("DuplicateTransitionError");
    expect(err.message).toContain("draft");
    expect(err.message).toContain("submit");
    expect(err.message).toContain("hasItems");
    expect(err.message).toContain("isAuthorised");
  });
});
```

- [ ] **Step 2: Run to fail**

```
pnpm vitest run tests/error.test.ts -t "DuplicateTransitionError"
```

- [ ] **Step 3: Implement `DuplicateTransitionError`**

Write `src/error/DuplicateTransitionError.ts`:

```ts
export interface DuplicateTransitionConflict {
  fromState: string;
  toState: string;
  eventName: string | null;
  existingConditionName: string | null;
  newConditionName: string | null;
}

export class DuplicateTransitionError extends Error {
  readonly conflict: Readonly<DuplicateTransitionConflict>;

  constructor(conflict: DuplicateTransitionConflict) {
    const eventLabel = conflict.eventName ?? "<automatic>";
    const existing = conflict.existingConditionName ?? "<no condition>";
    const incoming = conflict.newConditionName ?? "<no condition>";
    super(
      `Conflicting transition declarations from "${conflict.fromState}" to "${conflict.toState}" on event "${eventLabel}": existing condition "${existing}" vs new condition "${incoming}"`,
    );
    this.name = "DuplicateTransitionError";
    this.conflict = Object.freeze({ ...conflict });
  }
}
```

- [ ] **Step 4: Wire re-exports**

Add to `src/error/index.ts`:

```ts
export { DuplicateTransitionError } from "./DuplicateTransitionError.js";
export type { DuplicateTransitionConflict } from "./DuplicateTransitionError.js";
```

Add `DuplicateTransitionError` to `src/index.ts` errors block, and export the type alongside `GraphValidationCode`.

- [ ] **Step 5: Verify**

```
pnpm vitest run tests/error.test.ts -t "DuplicateTransitionError" && pnpm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/error/DuplicateTransitionError.ts src/error/index.ts src/index.ts tests/error.test.ts
git commit -m "feat(error): add DuplicateTransitionError"
```

---

## Task 1.4: `TransitionFrame` and `ProposedTransitionFrame` interfaces

**Files:**

- Create: `src/interfaces/TransitionFrameInterface.ts`
- Modify: `src/interfaces/index.ts`, `src/index.ts`
- Test: covered later when frames are produced; here just type-level.

- [ ] **Step 1: Write the interface file**

Write `src/interfaces/TransitionFrameInterface.ts`:

```ts
import type { StateInterface } from "./StateInterface.js";
import type { TransitionInterface } from "./TransitionInterface.js";
import type { EventInterface } from "./EventInterface.js";
import type { ConditionInterface } from "./ConditionInterface.js";

/**
 * Immutable snapshot passed to AfterTransitionObserver.notify().
 *
 * Captures the post-commit transition: state has already moved from
 * fromState to toState. Reading any field is safe and stable for the
 * duration of the observer call (and beyond — the frame is frozen).
 */
export interface TransitionFrame<TSubject = unknown> {
  readonly fromState: StateInterface;
  readonly toState: StateInterface;
  readonly transition: TransitionInterface<TSubject>;
  readonly event: EventInterface | null;
  readonly condition: ConditionInterface<TSubject> | null;
  readonly context: ReadonlyMap<string, unknown>;
  readonly timestamp: number;
  readonly machineName: string | null;
}

/**
 * Immutable snapshot passed to BeforeTransitionObserver.notify().
 *
 * Same shape as TransitionFrame but represents a *proposed* transition
 * — fromState is still the current state at notification time. Throwing
 * from a before-observer aborts the transition; otherwise commit proceeds.
 */
export interface ProposedTransitionFrame<
  TSubject = unknown,
> extends TransitionFrame<TSubject> {
  // Distinguished by interface identity, not by extra fields. The toState
  // is the *proposed* target; the FSM's currentState is still fromState
  // at the time before-observers run.
}
```

- [ ] **Step 2: Re-export from `src/interfaces/index.ts`**

Read the existing file, then add (in alphabetical position):

```ts
export type {
  TransitionFrame,
  ProposedTransitionFrame,
} from "./TransitionFrameInterface.js";
```

- [ ] **Step 3: Re-export from `src/index.ts`**

Add to the interface re-exports:

```ts
  TransitionFrame,
  ProposedTransitionFrame,
```

- [ ] **Step 4: Verify build**

```
pnpm run lint
```

Expected: PASS (no consumers yet, but the type compiles).

- [ ] **Step 5: Commit**

```bash
git add src/interfaces/TransitionFrameInterface.ts src/interfaces/index.ts src/index.ts
git commit -m "feat(interfaces): add TransitionFrame and ProposedTransitionFrame"
```

---

## Task 1.5: `BeforeTransitionObserver` and `AfterTransitionObserver` interfaces

**Files:**

- Create: `src/interfaces/BeforeTransitionObserverInterface.ts`
- Create: `src/interfaces/AfterTransitionObserverInterface.ts`
- Modify: `src/interfaces/index.ts`, `src/index.ts`

- [ ] **Step 1: Write `BeforeTransitionObserver` interface**

Write `src/interfaces/BeforeTransitionObserverInterface.ts`:

```ts
import type { MaybePromise } from "../MaybePromise.js";
import type { ProposedTransitionFrame } from "./TransitionFrameInterface.js";

/**
 * Runs before a transition commits. Throwing aborts the transition —
 * state is not mutated and the original caller's promise rejects with
 * the thrown error.
 *
 * Implementations must be pure relative to the FSM: they MUST NOT call
 * triggerEvent / checkTransitions on the same Statemachine. There is no
 * enqueue handle in the before phase by design — vetoes and validations
 * complete synchronously per observer; chained behaviour belongs in
 * AfterTransitionObserver.
 */
export interface BeforeTransitionObserver<TSubject = unknown> {
  notify(frame: ProposedTransitionFrame<TSubject>): MaybePromise<void>;
}
```

- [ ] **Step 2: Write `AfterTransitionObserver` interface**

Write `src/interfaces/AfterTransitionObserverInterface.ts`:

```ts
import type { MaybePromise } from "../MaybePromise.js";
import type { TransitionFrame } from "./TransitionFrameInterface.js";

/**
 * Handle passed to AfterTransitionObserver.notify so observers can
 * append events to the FSM's queue without reentering it.
 *
 * enqueue() never runs the event inline — it returns immediately. The
 * event runs as its own top-level operation after the current operation
 * (and any auto-follow-on transitions) completes.
 */
export interface EnqueueContext {
  enqueue(event: string, context?: Map<string, unknown>): void;
}

/**
 * Runs after a transition has committed. State has already moved.
 *
 * Errors thrown by an after-observer do NOT roll back the transition.
 * All after-observers are still invoked (no early bail). After all have
 * run, the caller's promise rejects: with the thrown error if exactly
 * one observer threw, or with a standard AggregateError if multiple did.
 */
export interface AfterTransitionObserver<TSubject = unknown> {
  notify(
    frame: TransitionFrame<TSubject>,
    ctx: EnqueueContext,
  ): MaybePromise<void>;
}
```

- [ ] **Step 3: Re-export interfaces**

Add to `src/interfaces/index.ts`:

```ts
export type { BeforeTransitionObserver } from "./BeforeTransitionObserverInterface.js";
export type {
  AfterTransitionObserver,
  EnqueueContext,
} from "./AfterTransitionObserverInterface.js";
```

Add the same names to the interfaces block of `src/index.ts`.

- [ ] **Step 4: Verify build**

```
pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interfaces/BeforeTransitionObserverInterface.ts src/interfaces/AfterTransitionObserverInterface.ts src/interfaces/index.ts src/index.ts
git commit -m "feat(interfaces): add BeforeTransitionObserver and AfterTransitionObserver"
```

---

## Task 1.6: `StatemachineOptions` type

**Files:**

- Create: `src/interfaces/StatemachineOptions.ts`
- Modify: `src/interfaces/index.ts`, `src/index.ts`

- [ ] **Step 1: Write the options type**

Write `src/interfaces/StatemachineOptions.ts`:

```ts
import type { MutexInterface } from "./MutexInterface.js";
import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";

export interface StatemachineOptions<TSubject = unknown> {
  /** Override the process's initial state. Defaults to process.getInitialState(). */
  initialStateName?: string;
  /** Defaults to OneOrNoneActiveTransition. */
  transitionSelector?: TransitionSelectorInterface<TSubject>;
  /** Defaults to NullMutex (no cross-process serialization). */
  mutex?: MutexInterface;
  /** When true, the engine releases the mutex at the end of each top-level operation. Defaults to true. */
  autoreleaseLock?: boolean;
}
```

- [ ] **Step 2: Re-export**

Add to `src/interfaces/index.ts` and `src/index.ts`:

```ts
export type { StatemachineOptions } from "./StatemachineOptions.js";
```

- [ ] **Step 3: Verify and commit**

```
pnpm run lint
```

```bash
git add src/interfaces/StatemachineOptions.ts src/interfaces/index.ts src/index.ts
git commit -m "feat(interfaces): add StatemachineOptions type"
```

---

# Phase 2 — `ProcessBuilder` and Frozen Graph

This phase introduces `ProcessBuilder`, makes `State`/`Transition`/`Process` constructible only via the builder, and freezes the graph. Most existing tests will not compile after Task 2.4 — the test conversion happens in Phase 6. Skip the existing test suite during Phase 2; run only the new builder tests.

## Task 2.1: Internal construction key

**Files:**

- Create: `src/internal/InternalConstruction.ts`

- [ ] **Step 1: Write the key module**

Write `src/internal/InternalConstruction.ts`:

```ts
/**
 * Symbol-based construction guard for State / Transition / Process.
 *
 * These classes' constructors require this symbol as the first argument.
 * Only ProcessBuilder imports it, ensuring only the builder can instantiate
 * the graph. User code receives an opaque type error if it tries to call
 * `new State(...)` directly.
 */
export const INTERNAL_CONSTRUCTION_KEY: unique symbol = Symbol(
  "@camcima/finita/InternalConstruction",
);
export type InternalConstructionKey = typeof INTERNAL_CONSTRUCTION_KEY;
```

- [ ] **Step 2: No re-export from src/index.ts**

The key is internal — do **not** re-export. It lives only in `src/internal/`.

- [ ] **Step 3: Verify and commit**

```
pnpm run lint
```

```bash
git add src/internal/InternalConstruction.ts
git commit -m "feat(internal): add construction key symbol for graph classes"
```

---

## Task 2.2: Refactor `State` to require the construction key

**Files:**

- Modify: `src/State.ts`
- Modify: `src/interfaces/StateInterface.ts`

This task makes `State` only constructible by the builder and removes the public `addTransition`/`setMetadataValue`/`deleteMetadataValue` methods from the interface. Tests that construct `State` directly stop compiling — that is expected and gets resolved in Phase 6.

- [ ] **Step 1: Update `StateInterface`**

Replace `src/interfaces/StateInterface.ts`:

```ts
import type { Named } from "./Named.js";
import type { Metadata } from "./Metadata.js";
import type { TransitionInterface } from "./TransitionInterface.js";
import type { EventInterface } from "./EventInterface.js";

export interface StateInterface extends Named, Metadata {
  getTransitions(): Iterable<TransitionInterface>;
  getEventNames(): string[];
  hasEvent(name: string): boolean;
  getEvent(name: string): EventInterface;
  getMetadataValue(key: string): unknown;
  hasMetadataValue(key: string): boolean;
  // No addTransition, no setMetadataValue, no deleteMetadataValue.
}
```

Note: `Metadata` interface as-is may include mutators. If it does, leave it for now — the runtime mutators on `State` are dropped below; the type intersection still admits them but no implementation exposes them. (We accept this minor type-level looseness; tightening `Metadata` is a separate concern in Sub-project C.)

- [ ] **Step 2: Rewrite `State`**

Replace `src/State.ts`:

```ts
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { Event } from "./Event.js";

export class State implements StateInterface {
  private readonly name: string;
  private readonly transitions: ReadonlySet<TransitionInterface>;
  private readonly events: ReadonlyMap<string, EventInterface>;
  private readonly metadata: ReadonlyMap<string, unknown>;

  constructor(
    key: InternalConstructionKey,
    name: string,
    transitions: Iterable<TransitionInterface>,
    eventNames: Iterable<string>,
    metadata: ReadonlyMap<string, unknown>,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error("State is not user-constructible; use ProcessBuilder.");
    }
    this.name = name;
    this.transitions = new Set(transitions);
    const events = new Map<string, EventInterface>();
    for (const en of eventNames) {
      events.set(en, new Event(en));
    }
    this.events = events;
    this.metadata = new Map(metadata);
  }

  getName(): string {
    return this.name;
  }

  getTransitions(): Iterable<TransitionInterface> {
    return this.transitions;
  }

  getEventNames(): string[] {
    return Array.from(this.events.keys());
  }

  hasEvent(name: string): boolean {
    return this.events.has(name);
  }

  getEvent(name: string): EventInterface {
    const event = this.events.get(name);
    if (!event) {
      throw new Error(`State "${this.name}" has no event "${name}"`);
    }
    return event;
  }

  getMetadata(): Record<string, unknown> {
    return Object.fromEntries(this.metadata);
  }

  getMetadataValue(key: string): unknown {
    return this.metadata.get(key);
  }

  hasMetadataValue(key: string): boolean {
    return this.metadata.has(key);
  }
}
```

Key changes from v2: constructor takes the symbol key, all collections are read-only, `addTransition`/`setMetadataValue`/`deleteMetadataValue` are gone, `getEvent` no longer auto-creates events (events are pre-baked from the builder).

- [ ] **Step 3: Verify TypeScript compiles `src/`**

```
pnpm exec tsc --noEmit
```

Expected: errors **inside `src/`** for any file that previously called `state.addTransition` or `new State("foo")` (will be `Process.ts`, `StateCollection.ts`, observers, `SetupHelper.ts`, `StateCollectionMerger.ts`, `Statemachine.ts`). Tests will also fail to compile but those are not in this `tsc` invocation.

These are expected and resolved later in Phase 2.

- [ ] **Step 4: No commit yet**

Wait until Task 2.5 — `src/` won't compile cleanly until then.

---

## Task 2.3: Refactor `Transition` to require the construction key

**Files:**

- Modify: `src/Transition.ts`

- [ ] **Step 1: Rewrite `Transition`**

Replace `src/Transition.ts`:

```ts
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { ConditionInterface } from "./interfaces/ConditionInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";

export class Transition<
  TSubject = unknown,
> implements TransitionInterface<TSubject> {
  private readonly targetState: StateInterface;
  private readonly eventName: string | null;
  private readonly condition: ConditionInterface<TSubject> | null;
  private readonly weight: number;

  constructor(
    key: InternalConstructionKey,
    targetState: StateInterface,
    eventName: string | null,
    condition: ConditionInterface<TSubject> | null,
    weight: number,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error(
        "Transition is not user-constructible; use ProcessBuilder.",
      );
    }
    this.targetState = targetState;
    this.eventName = eventName;
    this.condition = condition;
    this.weight = weight;
  }

  getTargetState(): StateInterface {
    return this.targetState;
  }

  getEventName(): string | null {
    return this.eventName;
  }

  getConditionName(): string | null {
    return this.condition ? this.condition.getName() : null;
  }

  getCondition(): ConditionInterface<TSubject> | null {
    return this.condition;
  }

  async isActive(
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<boolean> {
    let active: boolean;
    if (event) {
      active = event.getName() === this.eventName;
    } else {
      active = this.eventName === null;
    }
    if (this.condition && active) {
      active = await this.condition.checkCondition(subject, context);
    }
    return active;
  }

  getWeight(): number {
    return this.weight;
  }
}
```

`setWeight` is removed — weight is now construction-time only.

The `Weighted` interface (`src/interfaces/Weighted.ts`) currently includes `setWeight`. Inspect it; if it does, drop `setWeight` from the interface in this same task.

- [ ] **Step 2: Update `Weighted` if needed**

Read `src/interfaces/Weighted.ts`. If it has `setWeight`, change to:

```ts
export interface Weighted {
  getWeight(): number;
}
```

- [ ] **Step 3: No commit yet**

`src/` still won't compile until Task 2.5.

---

## Task 2.4: Refactor `Process` and reduce `StateCollection`

**Files:**

- Modify: `src/Process.ts`
- Modify: `src/StateCollection.ts`
- Modify: `src/interfaces/ProcessInterface.ts` (no change in shape; comments only)
- Modify: `src/interfaces/StateCollectionInterface.ts`

- [ ] **Step 1: Tighten `StateCollectionInterface`**

Replace `src/interfaces/StateCollectionInterface.ts` with:

```ts
import type { StateInterface } from "./StateInterface.js";

export interface StateCollectionInterface {
  getStates(): Iterable<StateInterface>;
  getState(name: string): StateInterface;
  hasState(name: string): boolean;
}
```

(Removes `addState` and `merge` from the public interface.)

- [ ] **Step 2: Rewrite `StateCollection` as internal frozen view**

Replace `src/StateCollection.ts`:

```ts
import type { StateCollectionInterface } from "./interfaces/StateCollectionInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";

export class StateCollection implements StateCollectionInterface {
  private readonly states: ReadonlyMap<string, StateInterface>;

  constructor(states: Iterable<StateInterface>) {
    const map = new Map<string, StateInterface>();
    for (const s of states) {
      map.set(s.getName(), s);
    }
    this.states = map;
  }

  getStates(): Iterable<StateInterface> {
    return this.states.values();
  }

  getState(name: string): StateInterface {
    const s = this.states.get(name);
    if (!s) {
      throw new Error(`State "${name}" not found`);
    }
    return s;
  }

  hasState(name: string): boolean {
    return this.states.has(name);
  }
}
```

Note: `StateCollection` is now an internal helper. We will **remove** it from `src/index.ts` exports in Task 2.7.

- [ ] **Step 3: Rewrite `Process`**

Replace `src/Process.ts`:

```ts
import type { ProcessInterface } from "./interfaces/ProcessInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { StateCollection } from "./StateCollection.js";

export class Process implements ProcessInterface {
  private readonly name: string;
  private readonly initialState: StateInterface;
  private readonly states: StateCollection;

  constructor(
    key: InternalConstructionKey,
    name: string,
    initialState: StateInterface,
    states: Iterable<StateInterface>,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error("Process is not user-constructible; use ProcessBuilder.");
    }
    this.name = name;
    this.initialState = initialState;
    this.states = new StateCollection(states);
    Object.freeze(this);
  }

  getName(): string {
    return this.name;
  }

  getInitialState(): StateInterface {
    return this.initialState;
  }

  getStates(): Iterable<StateInterface> {
    return this.states.getStates();
  }

  getState(name: string): StateInterface {
    return this.states.getState(name);
  }

  hasState(name: string): boolean {
    return this.states.hasState(name);
  }
}
```

`Object.freeze(this)` makes the object's own properties immutable at runtime. The internal `Map` inside `StateCollection` is also a `ReadonlyMap` and not exposed.

- [ ] **Step 4: No commit yet**

Continue to Task 2.5.

---

## Task 2.5: Implement `ProcessBuilder`

**Files:**

- Create: `src/ProcessBuilder.ts`
- Test: `tests/process-builder.test.ts` (created in Task 2.6)

Note: This is the largest single task. The builder validates the graph and constructs the frozen `Process`.

- [ ] **Step 1: Write the builder**

Write `src/ProcessBuilder.ts`:

```ts
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { ConditionInterface } from "./interfaces/ConditionInterface.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { Process } from "./Process.js";
import { State } from "./State.js";
import { Transition } from "./Transition.js";
import { DuplicateStateError } from "./error/DuplicateStateError.js";
import { ProcessFinalizedError } from "./error/ProcessFinalizedError.js";
import { GraphValidationError } from "./error/GraphValidationError.js";
import { DuplicateTransitionError } from "./error/DuplicateTransitionError.js";

interface StateSpec {
  name: string;
  initial: boolean;
  metadata: Map<string, unknown>;
}

interface TransitionSpec<TSubject = unknown> {
  fromState: string;
  toState: string;
  eventName: string | null;
  condition: ConditionInterface<TSubject> | null;
  weight: number;
}

export interface AddStateOptions {
  initial?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AddTransitionOptions<TSubject = unknown> {
  event?: string;
  condition?: ConditionInterface<TSubject>;
  weight?: number;
}

export interface BuildOptions {
  /**
   * When true, orphan/unreachable states cause GraphValidationError.
   * When false (default), orphan states are silently allowed.
   * The configured value applies to all states added before build().
   */
  strictOrphans?: boolean;
}

export class ProcessBuilder<TSubject = unknown> {
  private readonly processName: string;
  private readonly stateSpecs: Map<string, StateSpec> = new Map();
  private readonly transitionSpecs: TransitionSpec<TSubject>[] = [];
  private built = false;

  constructor(processName: string) {
    this.processName = processName;
  }

  addState(name: string, options: AddStateOptions = {}): this {
    if (this.built) {
      throw new ProcessFinalizedError(this.processName);
    }
    if (this.stateSpecs.has(name)) {
      throw new DuplicateStateError(name);
    }
    this.stateSpecs.set(name, {
      name,
      initial: options.initial === true,
      metadata: new Map(Object.entries(options.metadata ?? {})),
    });
    return this;
  }

  addTransition(
    fromState: string,
    toState: string,
    options: AddTransitionOptions<TSubject> = {},
  ): this {
    if (this.built) {
      throw new ProcessFinalizedError(this.processName);
    }
    let eventName: string | null = null;
    if (options.event !== undefined) {
      if (options.event.trim() === "") {
        throw new GraphValidationError(
          "emptyEventName",
          `addTransition called with an empty/whitespace event name from "${fromState}" to "${toState}"`,
          { fromState, toState },
        );
      }
      eventName = options.event;
    }
    this.transitionSpecs.push({
      fromState,
      toState,
      eventName,
      condition: options.condition ?? null,
      weight: options.weight ?? 1,
    });
    return this;
  }

  build(options: BuildOptions = {}): Process {
    if (this.built) {
      throw new ProcessFinalizedError(this.processName);
    }
    this.built = true;

    this.validateInitialState();
    this.validateTransitionEndpoints();
    this.validateNoConflictingDuplicates();

    const initialName = this.findInitialStateName();

    // First pass: build State instances *without* transitions, since
    // transitions need StateInterface references to their target.
    const eventNamesByState = this.collectEventNamesByState();
    const stateInstances = new Map<string, StateInterface>();
    for (const spec of this.stateSpecs.values()) {
      const state = new State(
        INTERNAL_CONSTRUCTION_KEY,
        spec.name,
        [], // transitions filled in below via mutation? no — see step 2
        eventNamesByState.get(spec.name) ?? [],
        spec.metadata,
      );
      stateInstances.set(spec.name, state);
    }

    // Second pass: now that all State instances exist, build transitions.
    // BUT: State stores transitions in its constructor as readonly. We need
    // to either (a) construct in topological order with delayed wiring, or
    // (b) re-create each State once its transitions are known. Option (b):
    const transitionsByState = this.buildTransitionsByState(stateInstances);
    const finalStates = new Map<string, StateInterface>();
    for (const spec of this.stateSpecs.values()) {
      const state = new State(
        INTERNAL_CONSTRUCTION_KEY,
        spec.name,
        transitionsByState.get(spec.name) ?? [],
        eventNamesByState.get(spec.name) ?? [],
        spec.metadata,
      );
      finalStates.set(spec.name, state);
    }

    // Third pass: rewrite transition target references to point to the
    // final State instances (since the first-pass states were temporary).
    // Easier: we rebuild transitions using finalStates as targets.
    const transitionsByStateFinal = this.buildTransitionsByState(finalStates);
    const reallyFinalStates = new Map<string, StateInterface>();
    for (const spec of this.stateSpecs.values()) {
      const state = new State(
        INTERNAL_CONSTRUCTION_KEY,
        spec.name,
        transitionsByStateFinal.get(spec.name) ?? [],
        eventNamesByState.get(spec.name) ?? [],
        spec.metadata,
      );
      reallyFinalStates.set(spec.name, state);
    }

    if (options.strictOrphans) {
      this.validateOrphans(reallyFinalStates, initialName);
    }

    const initialState = reallyFinalStates.get(initialName)!;
    return new Process(
      INTERNAL_CONSTRUCTION_KEY,
      this.processName,
      initialState,
      reallyFinalStates.values(),
    );
  }

  // --- private helpers ---

  private validateInitialState(): void {
    const initials = Array.from(this.stateSpecs.values()).filter(
      (s) => s.initial,
    );
    if (initials.length === 0) {
      throw new GraphValidationError(
        "missingInitialState",
        `Process "${this.processName}" has no state declared with { initial: true }`,
        { processName: this.processName },
      );
    }
    if (initials.length > 1) {
      throw new GraphValidationError(
        "multipleInitialStates",
        `Process "${this.processName}" declares multiple initial states: ${initials.map((s) => `"${s.name}"`).join(", ")}`,
        {
          processName: this.processName,
          initialStates: initials.map((s) => s.name),
        },
      );
    }
  }

  private findInitialStateName(): string {
    return Array.from(this.stateSpecs.values()).find((s) => s.initial)!.name;
  }

  private validateTransitionEndpoints(): void {
    for (const t of this.transitionSpecs) {
      if (!this.stateSpecs.has(t.fromState)) {
        throw new GraphValidationError(
          "unknownSource",
          `Transition source state "${t.fromState}" was not declared with addState`,
          {
            fromState: t.fromState,
            toState: t.toState,
            eventName: t.eventName,
          },
        );
      }
      if (!this.stateSpecs.has(t.toState)) {
        throw new GraphValidationError(
          "unknownTarget",
          `Transition target state "${t.toState}" was not declared with addState`,
          {
            fromState: t.fromState,
            toState: t.toState,
            eventName: t.eventName,
          },
        );
      }
    }
  }

  private validateNoConflictingDuplicates(): void {
    // Identity is (fromState, eventName, toState). Two specs with the same
    // identity but different condition objects — including different
    // condition.getName() values — are a conflict.
    const seen = new Map<string, TransitionSpec<TSubject>>();
    for (const t of this.transitionSpecs) {
      const conditionName = t.condition ? t.condition.getName() : null;
      const key = `${t.fromState}\x00${t.eventName ?? ""}\x00${t.toState}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, t);
        continue;
      }
      const existingConditionName = existing.condition
        ? existing.condition.getName()
        : null;
      const conflict =
        existing.condition !== t.condition &&
        existingConditionName !== conditionName;
      if (conflict) {
        throw new DuplicateTransitionError({
          fromState: t.fromState,
          toState: t.toState,
          eventName: t.eventName,
          existingConditionName,
          newConditionName: conditionName,
        });
      }
      // Same identity AND (same instance OR same condition name) → dedup.
    }
  }

  private collectEventNamesByState(): Map<string, string[]> {
    const out = new Map<string, Set<string>>();
    for (const t of this.transitionSpecs) {
      if (t.eventName === null) continue;
      let bucket = out.get(t.fromState);
      if (!bucket) {
        bucket = new Set();
        out.set(t.fromState, bucket);
      }
      bucket.add(t.eventName);
    }
    return new Map(
      Array.from(out.entries()).map(([k, v]) => [k, Array.from(v)]),
    );
  }

  private buildTransitionsByState(
    states: Map<string, StateInterface>,
  ): Map<string, TransitionInterface<TSubject>[]> {
    // Dedup by (fromState, eventName, toState, conditionName).
    const seen = new Set<string>();
    const out = new Map<string, TransitionInterface<TSubject>[]>();
    for (const t of this.transitionSpecs) {
      const conditionName = t.condition ? t.condition.getName() : null;
      const dedupKey = `${t.fromState}\x00${t.eventName ?? ""}\x00${t.toState}\x00${conditionName ?? ""}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const targetState = states.get(t.toState)!;
      const transition = new Transition<TSubject>(
        INTERNAL_CONSTRUCTION_KEY,
        targetState,
        t.eventName,
        t.condition,
        t.weight,
      );
      let bucket = out.get(t.fromState);
      if (!bucket) {
        bucket = [];
        out.set(t.fromState, bucket);
      }
      bucket.push(transition);
    }
    return out;
  }

  private validateOrphans(
    states: Map<string, StateInterface>,
    initialName: string,
  ): void {
    const reachable = new Set<string>();
    const queue: string[] = [initialName];
    while (queue.length > 0) {
      const name = queue.shift()!;
      if (reachable.has(name)) continue;
      reachable.add(name);
      const s = states.get(name)!;
      for (const t of s.getTransitions()) {
        queue.push(t.getTargetState().getName());
      }
    }
    const orphans: string[] = [];
    for (const name of states.keys()) {
      if (!reachable.has(name)) orphans.push(name);
    }
    if (orphans.length > 0) {
      throw new GraphValidationError(
        "orphanState",
        `Process "${this.processName}" has unreachable states: ${orphans.map((n) => `"${n}"`).join(", ")}`,
        { processName: this.processName, orphanStates: orphans },
      );
    }
  }
}
```

> **Note on the multi-pass construction:** because `State` stores its transitions as a `readonly` collection in the constructor, transitions need `StateInterface` references to _final_ states. The triple-pass above is correct but verbose — implementers may collapse it by either (a) using a placeholder target state and a single re-build pass, or (b) deferring transition construction to a wrapper that holds delayed targets. The behaviour is identical; the test suite verifies endpoints. Pick whichever the implementer prefers when actually writing the code; the test in Task 2.6 will catch any regression.

- [ ] **Step 2: No re-export yet**

We add `ProcessBuilder` to `src/index.ts` in Task 2.7 once the test passes.

- [ ] **Step 3: Verify TypeScript compiles `src/`**

```
pnpm exec tsc --noEmit
```

Expected: errors in `Statemachine.ts`, observers, `Factory.ts`, `SetupHelper.ts`, `StateCollectionMerger.ts` (all use removed APIs). Does not block — these are fixed in later phases. The new file `src/ProcessBuilder.ts` itself should compile.

If `ProcessBuilder.ts` has errors, fix them before proceeding.

---

## Task 2.6: `ProcessBuilder` test suite

**Files:**

- Create: `tests/process-builder.test.ts`

This is the test suite that closes #3, #5, #6 at the builder level.

- [ ] **Step 1: Write the test file**

Write `tests/process-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Tautology,
  Contradiction,
  CallbackCondition,
  ProcessFinalizedError,
  GraphValidationError,
  DuplicateTransitionError,
  DuplicateStateError,
} from "../src/index.js";

describe("ProcessBuilder", () => {
  it("builds a single-state process", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    expect(process.getName()).toBe("p");
    expect(process.getInitialState().getName()).toBe("a");
    expect(Array.from(process.getStates())).toHaveLength(1);
  });

  it("builds a multi-state graph with transitions", () => {
    const process = new ProcessBuilder("order")
      .addState("draft", { initial: true })
      .addState("submitted")
      .addState("paid")
      .addTransition("draft", "submitted", { event: "submit" })
      .addTransition("submitted", "paid", { event: "pay" })
      .build();
    expect(Array.from(process.getStates())).toHaveLength(3);
    expect(process.hasState("paid")).toBe(true);
    const draft = process.getState("draft");
    const draftTransitions = Array.from(draft.getTransitions());
    expect(draftTransitions).toHaveLength(1);
    expect(draftTransitions[0]!.getTargetState().getName()).toBe("submitted");
    expect(draftTransitions[0]!.getEventName()).toBe("submit");
  });

  it("supports automatic transitions (no event name)", () => {
    const process = new ProcessBuilder("auto")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { condition: new Tautology() })
      .build();
    const a = process.getState("a");
    const t = Array.from(a.getTransitions())[0]!;
    expect(t.getEventName()).toBeNull();
    expect(t.getConditionName()).toBe("Tautology");
  });

  it("preserves transition weights", () => {
    const process = new ProcessBuilder("w")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", weight: 5 })
      .build();
    const t = Array.from(process.getState("a").getTransitions())[0]!;
    expect(t.getWeight()).toBe(5);
  });

  it("throws ProcessFinalizedError if build() is called twice", () => {
    const builder = new ProcessBuilder("p").addState("a", { initial: true });
    builder.build();
    expect(() => builder.build()).toThrow(ProcessFinalizedError);
  });

  it("throws ProcessFinalizedError on addState after build()", () => {
    const builder = new ProcessBuilder("p").addState("a", { initial: true });
    builder.build();
    expect(() => builder.addState("b")).toThrow(ProcessFinalizedError);
  });

  it("throws ProcessFinalizedError on addTransition after build()", () => {
    const builder = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    builder.build();
    expect(() => builder.addTransition("a", "b", { event: "go" })).toThrow(
      ProcessFinalizedError,
    );
  });

  it("rejects duplicate addState calls", () => {
    expect(() => new ProcessBuilder("p").addState("a").addState("a")).toThrow(
      DuplicateStateError,
    );
  });

  it("requires exactly one initial state", () => {
    expect(() => new ProcessBuilder("p").addState("a").build()).toThrow(
      GraphValidationError,
    );
    try {
      new ProcessBuilder("p").addState("a").build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("missingInitialState");
    }
  });

  it("rejects multiple initial states", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b", { initial: true })
        .build(),
    ).toThrow(GraphValidationError);
    try {
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b", { initial: true })
        .build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("multipleInitialStates");
    }
  });

  it("rejects transition with unknown source state", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("nope", "a", { event: "go" })
        .build(),
    ).toThrow(GraphValidationError);
    try {
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("nope", "a", { event: "go" })
        .build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("unknownSource");
    }
  });

  it("rejects transition with unknown target state", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("a", "nope", { event: "go" })
        .build(),
    ).toThrow(GraphValidationError);
    try {
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("a", "nope", { event: "go" })
        .build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("unknownTarget");
    }
  });

  it("rejects empty event name (closes #5)", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "" }),
    ).toThrow(GraphValidationError);
  });

  it("rejects whitespace-only event name", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "   " }),
    ).toThrow(GraphValidationError);
  });

  it("dedups transitions with same (from, event, to, conditionName)", () => {
    const cond = new Tautology();
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", condition: cond })
      .addTransition("a", "b", { event: "go", condition: cond })
      .build();
    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
  });

  it("rejects conflicting duplicate transitions (closes #6)", () => {
    const c1 = new CallbackCondition(async () => true, "shared");
    const c2 = new CallbackCondition(async () => false, "shared");
    // Same name "shared" but different identity AND different logic.
    // Identity differs but name matches → according to spec, condition name
    // is the dedup key, so this is dedup'd. We instead test the conflict
    // case: same name? actually, condition.getName() comparison says
    // same name → dedup. To test the conflict path:
    const c3 = new Tautology(); // name "Tautology"
    const c4 = new Contradiction(); // name "Contradiction"
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "go", condition: c3 })
        .addTransition("a", "b", { event: "go", condition: c4 })
        .build(),
    ).toThrow(DuplicateTransitionError);
  });

  it("strictOrphans rejects unreachable states", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("orphan")
        .build({ strictOrphans: true }),
    ).toThrow(GraphValidationError);
  });

  it("strictOrphans=false (default) tolerates unreachable states", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("orphan")
      .build();
    expect(process.hasState("orphan")).toBe(true);
  });

  it("registers events implied by transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const a = process.getState("a");
    expect(a.hasEvent("go")).toBe(true);
    expect(a.getEventNames()).toContain("go");
  });

  it("returned Process is frozen", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    expect(Object.isFrozen(process)).toBe(true);
  });

  it("returned State has no addTransition method (closes #3)", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    const a = process.getState("a") as unknown as { addTransition?: unknown };
    expect(a.addTransition).toBeUndefined();
  });

  it("returned Transition has no setWeight method", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const t = Array.from(
      process.getState("a").getTransitions(),
    )[0]! as unknown as {
      setWeight?: unknown;
    };
    expect(t.setWeight).toBeUndefined();
  });

  it("rejects construction of State directly (defence in depth)", () => {
    // @ts-expect-error — `State` is exported as a type only; direct
    // construction must fail at runtime even when bypassing the types.
    const StateCtor = (
      require("../src/State.js") as {
        State: new (...args: unknown[]) => unknown;
      }
    ).State;
    expect(() => new StateCtor("a")).toThrow();
  });
});
```

> **Note on the last test:** ESM `require` may not be available depending on the test runner; if vitest's ESM mode is in use (it is here), use a dynamic import inside an async test or remove the test and rely on the type-level guard. Pick whichever works in the project's test environment. The intent of the test is "calling `new State(...)` from non-builder code throws."

- [ ] **Step 2: Run the test suite — should NOT pass yet**

```
pnpm vitest run tests/process-builder.test.ts
```

Expected: many imports fail (`ProcessBuilder` not yet in `src/index.ts`).

This is the green-light to wire exports in Task 2.7.

---

## Task 2.7: Wire `ProcessBuilder` exports and run the suite

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/index.ts`**

Make the following changes:

1. **Add** the `ProcessBuilder` re-export to the core block:

```ts
export { ProcessBuilder } from "./ProcessBuilder.js";
export type {
  AddStateOptions,
  AddTransitionOptions,
  BuildOptions,
} from "./ProcessBuilder.js";
```

2. **Remove** the public re-exports of `State`, `Transition`, `Process`, `StateCollection`, `Dispatcher`. Replace the core-classes block with:

```ts
// Core classes
export { Event } from "./Event.js";
export { Process } from "./Process.js";
export { State } from "./State.js"; // exported for type / instanceof use only
export { Transition } from "./Transition.js"; // same
export { ProcessBuilder } from "./ProcessBuilder.js";
export { Statemachine } from "./Statemachine.js";
```

(`State`, `Transition`, `Process` are still exported so users can do `instanceof` and type narrowing. Their constructors are unusable from outside the package.)

3. **Remove** `Dispatcher` from re-exports (it becomes internal in Task 3.1).

- [ ] **Step 2: Run the builder test suite**

```
pnpm vitest run tests/process-builder.test.ts
```

Expected: `tests/process-builder.test.ts` passes. Other test files may fail to compile — ignore them.

If any builder test fails, debug the builder implementation in Task 2.5 until all builder tests pass.

- [ ] **Step 3: Commit Phase 2**

```bash
git add src/State.ts src/Transition.ts src/Process.ts src/StateCollection.ts \
        src/interfaces/StateInterface.ts src/interfaces/StateCollectionInterface.ts \
        src/interfaces/Weighted.ts \
        src/internal/InternalConstruction.ts src/ProcessBuilder.ts \
        tests/process-builder.test.ts src/index.ts
git commit -m "feat(builder): introduce ProcessBuilder and freeze graph

- States, transitions, and Process are now constructed only via the builder
  (internal symbol-based construction key)
- ProcessBuilder validates: missing/multiple initial state, unknown source,
  unknown target, empty event name, conflicting duplicate transitions,
  optional strict orphan-state detection
- Process is frozen; State and Transition have no public mutators
- Closes IMPLEMENTATION_REVIEW.md #3 (graph immutability), #5 (empty event
  names at build time), #6 (duplicate-with-conflict at build time)"
```

---

# Phase 3 — `Statemachine` Execution Rewrite

This phase replaces the `Statemachine` execution engine. Existing tests do not compile until Phase 6. The new behavior is verified with two new test files (`tests/concurrency.test.ts`, `tests/observer-frame.test.ts`).

## Task 3.1: Move `Dispatcher` to internal

**Files:**

- Move: `src/Dispatcher.ts` → `src/internal/Dispatcher.ts`
- Modify: `src/interfaces/DispatcherInterface.ts` (move to `src/internal/DispatcherInterface.ts` — same logic) — **decision:** keep the interface in `src/interfaces/` because other internal files may need its type. Just remove `Dispatcher` from `src/index.ts`.
- Modify: `src/index.ts`

- [ ] **Step 1: Move the file**

```bash
mkdir -p src/internal
git mv src/Dispatcher.ts src/internal/Dispatcher.ts
```

- [ ] **Step 2: Update imports inside the moved file**

Read `src/internal/Dispatcher.ts` and update the relative imports — `./interfaces/...` becomes `../interfaces/...`.

- [ ] **Step 3: Remove `Dispatcher` from `src/index.ts`**

Delete the line:

```ts
export { Dispatcher } from "./Dispatcher.js";
```

(Already removed in Task 2.7 if you followed those instructions; verify here.)

- [ ] **Step 4: Verify**

```
pnpm exec tsc --noEmit
```

Expected: `Dispatcher` move alone introduces no new errors (existing errors from Phase 2 still present in `Statemachine.ts` and observers).

- [ ] **Step 5: No commit yet** — Phase 3 commits at the end.

---

## Task 3.2: Implement `OperationQueue`

**Files:**

- Create: `src/internal/OperationQueue.ts`

- [ ] **Step 1: Write the queue**

Write `src/internal/OperationQueue.ts`:

```ts
export type OperationKind = "triggerEvent" | "checkTransitions";

export interface QueuedOperation {
  kind: OperationKind;
  eventName: string | null;
  context: Map<string, unknown>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * FIFO queue of pending top-level Statemachine operations.
 *
 * Holds the deferred resolvers so that callers' promises can be settled
 * by the engine when their operation runs. Has no side effects beyond
 * push/shift; the Statemachine drives execution.
 */
export class OperationQueue {
  private readonly items: QueuedOperation[] = [];

  enqueue(op: QueuedOperation): void {
    this.items.push(op);
  }

  dequeue(): QueuedOperation | undefined {
    return this.items.shift();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
}
```

- [ ] **Step 2: Verify and continue**

```
pnpm exec tsc --noEmit src/internal/OperationQueue.ts
```

(Type-checked as part of the next `tsc --noEmit` run; nothing to commit yet.)

---

## Task 3.3: Rewrite `Statemachine` — skeleton + queue + options constructor

**Files:**

- Modify: `src/Statemachine.ts` (full rewrite)
- Modify: `src/interfaces/StatemachineInterface.ts`

This task is large. It establishes the new shape; subsequent tasks fill in transition logic and observer notification.

- [ ] **Step 1: Update `StatemachineInterface`**

Replace `src/interfaces/StatemachineInterface.ts`:

```ts
import type { StateInterface } from "./StateInterface.js";
import type { ProcessInterface } from "./ProcessInterface.js";
import type { TransitionSelectorInterface } from "./TransitionSelectorInterface.js";
import type { MutexInterface } from "./MutexInterface.js";
import type { BeforeTransitionObserver } from "./BeforeTransitionObserverInterface.js";
import type { AfterTransitionObserver } from "./AfterTransitionObserverInterface.js";

export interface StatemachineInterface<TSubject = unknown> {
  getCurrentState(): StateInterface;
  getLastState(): StateInterface | null;
  getSubject(): TSubject;
  getProcess(): ProcessInterface;

  triggerEvent(name: string, context?: Map<string, unknown>): Promise<void>;
  checkTransitions(context?: Map<string, unknown>): Promise<void>;

  attachBefore(observer: BeforeTransitionObserver<TSubject>): void;
  detachBefore(observer: BeforeTransitionObserver<TSubject>): void;
  getBeforeObservers(): Iterable<BeforeTransitionObserver<TSubject>>;

  attachAfter(observer: AfterTransitionObserver<TSubject>): void;
  detachAfter(observer: AfterTransitionObserver<TSubject>): void;
  getAfterObservers(): Iterable<AfterTransitionObserver<TSubject>>;

  acquireLock(): Promise<boolean>;
  releaseLock(): Promise<void>;
  isLockAcquired(): boolean;

  isAutoreleaseLock(): boolean;
  setAutoreleaseLock(autorelease: boolean): void;
}
```

Key removals: `attach`/`detach`/`notify`/`getObservers` (the `ObservableSubject` shape), `getSelectedTransition`, `getCurrentContext`. The interface no longer extends `ObservableSubject`.

- [ ] **Step 2: Rewrite `Statemachine.ts` — skeleton**

Replace `src/Statemachine.ts`:

```ts
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
import { ActiveTransitionFilter } from "./filter/ActiveTransitionFilter.js";
import { WrongEventForStateError } from "./error/WrongEventForStateError.js";
import { LockCanNotBeAcquiredError } from "./error/LockCanNotBeAcquiredError.js";

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

  // --- internal runner (filled in by Task 3.4) ---

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

  // Stub; full implementation lands in Task 3.4.
  private async runOperation(
    _op: import("./internal/OperationQueue.js").QueuedOperation,
  ): Promise<void> {
    throw new Error("Statemachine.runOperation not implemented yet — Task 3.4");
  }
}
```

> **Note:** This skeleton compiles but operations always throw at runtime. Task 3.4 fills in `runOperation`. Don't run tests yet.

- [ ] **Step 3: Verify TypeScript inside `src/Statemachine.ts`**

```
pnpm exec tsc --noEmit
```

Expected: errors elsewhere (observers, factory) but `Statemachine.ts` itself should compile.

If `Statemachine.ts` itself has errors, fix them now.

---

## Task 3.4: Implement `runOperation` — frames, two-phase notification, mutex, AggregateError

**Files:**

- Modify: `src/Statemachine.ts`

- [ ] **Step 1: Implement the operation runner**

Replace the stub `runOperation` and add helpers:

```ts
// --- Inside the Statemachine class ---

private async runOperation(
  op: import("./internal/OperationQueue.js").QueuedOperation,
): Promise<void> {
  let acquired = false;
  try {
    if (!(await this.mutex.acquireLock())) {
      throw new LockCanNotBeAcquiredError("Lock can not be acquired!");
    }
    acquired = true;

    const event =
      op.kind === "triggerEvent" ? this.resolveEvent(op.eventName!) : null;

    await this.processOperation(event, op.context);
    op.resolve();
  } catch (err) {
    op.reject(err);
  } finally {
    if (acquired && this.autoreleaseLock) {
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

  while (true) {
    const transitions = this.currentState.getTransitions();
    const active = await ActiveTransitionFilter.filter(
      transitions,
      this.subject,
      context,
      event ?? undefined,
    );
    const selected = this.transitionSelector.selectTransition(active) as
      | TransitionInterface<TSubject>
      | null;

    if (!selected) {
      return;
    }

    const target = selected.getTargetState();

    if (selected.getEventName() === null) {
      automaticVisited.add(this.currentState);
      if (automaticVisited.has(target)) {
        throw new Error(
          `Automatic transition cycle detected: state "${target.getName()}" was already visited — this would cause infinite recursion`,
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

      // Event-bound dispatcher commands (legacy Event observers).
      if (event) {
        const dispatcher = new Dispatcher();
        dispatcher.dispatch(event, [this.subject, context]);
        await dispatcher.invoke();
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
```

> **Important note on chained operations and error handling:** `enqueueCtx.enqueue` resolves silently. The chained operation runs as its own top-level call. If a chained `OnEnter` event has no matching event in the destination state, it currently raises `WrongEventForStateError`. To avoid this for the canonical pattern (state has no `onEnter` event → skip the chain), `OnEnterObserver` must check `frame.toState.hasEvent(name)` _before_ calling `enqueue`. The reborn `OnEnterObserver` in Task 4.1 does this.

- [ ] **Step 2: Verify TypeScript**

```
pnpm exec tsc --noEmit
```

Expected: errors persist in `observers/`, `factory/`, and `util/` — those are addressed in Phases 4 and 5. `Statemachine.ts` should compile.

If `Statemachine.ts` has errors, fix them now.

---

## Task 3.5: Verify the new `Statemachine` against in-place smoke test

To validate the engine before depending observers are migrated, write a tiny inline smoke test inside `tests/concurrency.test.ts` (which is built out fully in Phase 6, but a smoke test now confirms the runner is wired correctly).

**Files:**

- Create: `tests/concurrency.test.ts` (smoke only)

- [ ] **Step 1: Write the smoke test**

```ts
import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";

describe("Statemachine — smoke", () => {
  it("runs a single triggerEvent end-to-end", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("go");
    expect(sm.getCurrentState().getName()).toBe("b");
    expect(sm.getLastState()!.getName()).toBe("a");
  });

  it("runs an automatic checkTransitions", async () => {
    const { Tautology } = await import("../src/index.js");
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { condition: new Tautology() })
      .build();
    const sm = new Statemachine({}, process);
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("b");
  });
});
```

- [ ] **Step 2: Run only this file**

```
pnpm vitest run tests/concurrency.test.ts
```

Expected: PASS.

If it fails, debug Task 3.4 until both smoke tests pass.

- [ ] **Step 3: Commit Phase 3**

```bash
git add src/Statemachine.ts src/internal/Dispatcher.ts \
        src/internal/OperationQueue.ts \
        src/interfaces/StatemachineInterface.ts \
        src/interfaces/Observer.ts \
        tests/concurrency.test.ts src/index.ts
git commit -m "feat(statemachine): rewrite execution engine

- Per-instance FIFO operation queue serializes concurrent triggerEvent and
  checkTransitions calls on the same Statemachine instance
- Two-phase observer lifecycle: BeforeTransitionObserver may veto, then
  Event-bound dispatcher commands run, then commit, then
  AfterTransitionObservers run with frozen TransitionFrame
- Errors from after-observers no longer roll back state; one error rethrown
  directly, multiple aggregated into AggregateError
- Constructor takes options object; getSelectedTransition / getCurrentContext
  removed from public surface
- Mutex acquireLock no longer short-circuits on isAcquired()
- Closes IMPLEMENTATION_REVIEW.md #1 (concurrent ops), #4 (transaction
  semantics)"
```

---

# Phase 4 — Built-in Observers Migration

## Task 4.1: `OnEnterObserver` — reborn as queueing `AfterTransitionObserver`

**Files:**

- Modify: `src/observer/OnEnterObserver.ts`

- [ ] **Step 1: Rewrite the observer**

Replace `src/observer/OnEnterObserver.ts`:

```ts
import type {
  AfterTransitionObserver,
  EnqueueContext,
} from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";

/**
 * After-transition observer that fires an event named DEFAULT_EVENT_NAME
 * (or a custom name) when entering any state that has that event declared.
 *
 * The chained event is *enqueued*, not invoked inline: it runs as its own
 * top-level operation after the current operation completes. Other
 * after-observers registered after OnEnterObserver still see the original
 * frame, not the chained one.
 */
export class OnEnterObserver<
  TSubject = unknown,
> implements AfterTransitionObserver<TSubject> {
  static readonly DEFAULT_EVENT_NAME = "onEnter";

  private readonly eventName: string;

  constructor(eventName: string = OnEnterObserver.DEFAULT_EVENT_NAME) {
    this.eventName = eventName;
  }

  notify(frame: TransitionFrame<TSubject>, ctx: EnqueueContext): void {
    if (frame.toState.hasEvent(this.eventName)) {
      ctx.enqueue(this.eventName, new Map(frame.context));
    }
  }
}
```

- [ ] **Step 2: Verify and commit**

```
pnpm exec tsc --noEmit
```

(Expect remaining errors elsewhere; this file should compile.)

```bash
git add src/observer/OnEnterObserver.ts
git commit -m "feat(observer): reborn OnEnterObserver as queueing after-observer"
```

---

## Task 4.2: `TransitionLogger` — frame-based `AfterTransitionObserver`

**Files:**

- Modify: `src/observer/TransitionLogger.ts`

- [ ] **Step 1: Rewrite**

Replace `src/observer/TransitionLogger.ts`:

```ts
import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";
import type { LoggerInterface } from "../interfaces/LoggerInterface.js";
import type { Named } from "../interfaces/Named.js";

function isNamed(obj: unknown): obj is Named {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getName" in obj &&
    typeof (obj as Named).getName === "function"
  );
}

function asString(obj: unknown): string {
  if (isNamed(obj)) return obj.getName();
  return String(obj);
}

export class TransitionLogger<
  TSubject = unknown,
> implements AfterTransitionObserver<TSubject> {
  private readonly logger: LoggerInterface;
  private readonly loggerLevel: string;

  constructor(logger: LoggerInterface, loggerLevel = "info") {
    this.logger = logger;
    this.loggerLevel = loggerLevel;
  }

  notify(frame: TransitionFrame<TSubject>): void {
    let message = "Transition";

    if (frame.machineName != null) {
      // Subject identity isn't on the frame in v3 — callers who want subject
      // names attach a custom observer that closes over the subject.
    }

    message += ` from "${asString(frame.fromState)}" to "${asString(frame.toState)}"`;

    const eventName = frame.event ? frame.event.getName() : null;
    const conditionName = frame.condition ? frame.condition.getName() : null;
    if (eventName || conditionName) {
      message += " with";
      if (eventName) message += ` event "${eventName}"`;
      if (conditionName) message += ` condition "${conditionName}"`;
    }

    this.logger.log(this.loggerLevel, message, {
      fromState: frame.fromState,
      toState: frame.toState,
      event: frame.event,
      transition: frame.transition,
      machineName: frame.machineName,
    });
  }
}
```

> **Note:** v2's `TransitionLogger` could read `subject.getSubject()` for the log payload. v3 doesn't pass the subject through the frame (subject is per-machine, not per-transition). Users who want subject identity in the log can subclass and inject the `Statemachine` reference at construction time.

- [ ] **Step 2: Verify and continue**

```
pnpm exec tsc --noEmit
```

(Errors elsewhere; this file compiles.)

No commit yet — bundled at end of Phase 4.

---

## Task 4.3: `StatefulStatusChanger` — frame + injected subject

**Files:**

- Modify: `src/observer/StatefulStatusChanger.ts`

`StatefulStatusChanger`'s job is to push the SM's current state name onto the subject (which implements `StatefulInterface`). In v3 the subject is on the SM, not the frame, so the observer needs the subject injected at construction.

- [ ] **Step 1: Rewrite**

Replace `src/observer/StatefulStatusChanger.ts`:

```ts
import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";
import type { StatefulInterface } from "../interfaces/StatefulInterface.js";

export class StatefulStatusChanger<
  TSubject extends StatefulInterface,
> implements AfterTransitionObserver<TSubject> {
  private readonly subject: TSubject;

  constructor(subject: TSubject) {
    this.subject = subject;
  }

  notify(frame: TransitionFrame<TSubject>): void {
    this.subject.setCurrentStateName(frame.toState.getName());
  }
}
```

> **Migration note:** v2's version found the subject reflectively from the SM. v3 requires explicit injection. The migration guide will document this.

- [ ] **Step 2: Verify and continue**

```
pnpm exec tsc --noEmit
```

(Errors elsewhere; this file compiles.)

---

## Task 4.4: Restrict `CallbackObserver` to `Event` use

**Files:**

- Modify: `src/observer/CallbackObserver.ts`

`CallbackObserver` is the legacy `Observer` for `Event` (commands). It's no longer attachable to `Statemachine`. The implementation is unchanged but its TypeScript signature is left targeted at `Event`.

- [ ] **Step 1: Read current file and confirm no changes are required**

`src/observer/CallbackObserver.ts` currently implements the legacy `Observer` interface. Since the `Observer` interface is retained for `Event`, no source change is required. Verify the doc-comment is still accurate; if it implies use with `Statemachine`, edit:

Replace the file content to:

```ts
import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { EventInterface } from "../interfaces/EventInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

/**
 * Legacy Observer for Event observers (commands attached to specific events).
 *
 * In v3 this is no longer used as a Statemachine observer. To run a
 * callback after every transition, implement AfterTransitionObserver
 * directly or compose a small wrapper.
 */
export class CallbackObserver implements Observer {
  private readonly callback: (...args: unknown[]) => MaybePromise<void>;

  constructor(callback: (...args: unknown[]) => MaybePromise<void>) {
    this.callback = callback;
  }

  update(subject: ObservableSubject): MaybePromise<void> {
    const event = subject as EventInterface;
    if (typeof event.getInvokeArgs === "function") {
      return this.callback(...event.getInvokeArgs());
    }
    return this.callback(subject);
  }
}
```

- [ ] **Step 2: Verify and commit Phase 4**

```
pnpm exec tsc --noEmit
```

Expected: errors only in `factory/`, `util/`, and tests.

```bash
git add src/observer/OnEnterObserver.ts src/observer/TransitionLogger.ts \
        src/observer/StatefulStatusChanger.ts src/observer/CallbackObserver.ts
git commit -m "feat(observer): migrate built-in observers to v3 frame-based API

- OnEnterObserver: enqueues chained events instead of reentering inline
  (closes IMPLEMENTATION_REVIEW.md #2)
- TransitionLogger: reads from TransitionFrame; subject identity
  injection deferred to subclasses
- StatefulStatusChanger: takes the subject at construction
- CallbackObserver: documented as Event-only in v3"
```

---

# Phase 5 — Dependent-Module Migration

## Task 5.1: Update `Factory` to v3 constructor and observer API

**Files:**

- Modify: `src/factory/Factory.ts`

- [ ] **Step 1: Rewrite the factory's `createStatemachine`**

Replace `src/factory/Factory.ts`:

```ts
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
```

> **Note:** `FactoryInterface` may declare the old `attachStatemachineObserver` shape — check `src/interfaces/FactoryInterface.ts`. If so, update that interface to expose `attachBeforeObserver`/`attachAfterObserver` (and their detach pairs). This is a public API change.

- [ ] **Step 2: Update `FactoryInterface` if necessary**

Read `src/interfaces/FactoryInterface.ts`. If it has `attachStatemachineObserver`/`detachStatemachineObserver`/`getStatemachineObservers`, replace with the v3 shape:

```ts
import type { ProcessDetectorInterface } from "./ProcessDetectorInterface.js";
import type { StateNameDetectorInterface } from "./StateNameDetectorInterface.js";
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
```

- [ ] **Step 3: Verify and continue**

```
pnpm exec tsc --noEmit
```

(Errors only in `util/` and tests.)

---

## Task 5.2: Remove `SetupHelper` and `StateCollectionMerger`

**Files:**

- Delete: `src/util/SetupHelper.ts`
- Delete: `src/util/StateCollectionMerger.ts`
- Modify: `src/util/index.ts`
- Modify: `src/index.ts`
- Delete: `tests/util.test.ts`
- Modify: any other source file that still imports them (search exposes any). The `StateCollection.merge` method also referenced `StateCollectionMerger`; it's already been removed in Task 2.4.

`SetupHelper` and `StateCollectionMerger` rely on user-mutable `State`/`Transition`. They cannot work in v3 without significant rework that's out of scope for this plan.

- [ ] **Step 1: Delete the source files**

```bash
git rm src/util/SetupHelper.ts src/util/StateCollectionMerger.ts
```

- [ ] **Step 2: Update `src/util/index.ts`**

Read it. If it re-exports both, replace its contents with an empty module placeholder or remove the file. To keep the package layout, leave `src/util/index.ts` as:

```ts
// Reserved for future v3 utility helpers (re-introducing builder-aware
// setup helpers is out of scope for v3.0 and tracked separately).
export {};
```

- [ ] **Step 3: Update `src/index.ts` — remove `SetupHelper`/`StateCollectionMerger` exports**

Replace the utils block:

```ts
// (removed in v3.0; see docs/migration/v2-to-v3.md)
```

(Or simply delete the block.)

- [ ] **Step 4: Delete the test file**

```bash
git rm tests/util.test.ts
```

- [ ] **Step 5: Verify and commit Phase 5**

```
pnpm exec tsc --noEmit
```

Expected: errors only in remaining test files (Phase 6).

```bash
git add src/factory/Factory.ts src/interfaces/FactoryInterface.ts \
        src/util/index.ts src/index.ts
git commit -m "feat: migrate Factory and remove SetupHelper/StateCollectionMerger

- Factory: uses v3 options-object Statemachine constructor; exposes
  attachBeforeObserver and attachAfterObserver
- Removed SetupHelper and StateCollectionMerger; both depended on
  user-mutable State/Transition which no longer exist in v3
- Migration paths documented in docs/migration/v2-to-v3.md"
```

---

# Phase 6 — Test Conversion and Regression Suites

This phase converts the existing test files to the v3 API and adds dedicated regression suites for each finding.

The **conversion pattern** for existing tests, applied uniformly:

1. **Replace** direct construction of `State` / `Transition` / `Process` / `StateCollection` with `ProcessBuilder`.
2. **Replace** `new Statemachine(subject, process, name, selector, mutex)` with `new Statemachine(subject, process, { initialStateName: name, transitionSelector: selector, mutex })`.
3. **Replace** `sm.attach(observer)` with `sm.attachAfter(observer)` (or `attachBefore` if the observer's logic is pre-commit). Update the observer to implement `AfterTransitionObserver` / `BeforeTransitionObserver`.
4. **Drop assertions** on removed APIs (`getSelectedTransition`, `getCurrentContext`, `getObservers`, `notify`).
5. **Update assertions** about transient field clearing — the v3 contract is that observers receive frames; no transient fields exist.
6. For tests that asserted `Observer.update(subject)` semantics, rewrite as either an `AfterTransitionObserver` reading from frame, or as a callback wrapper.

Each task in this phase converts one or two test files at a time, runs them, and commits.

---

## Task 6.1: Convert `tests/core.test.ts`

**Files:**

- Modify: `tests/core.test.ts`

Read the existing file in full and rewrite using the conversion pattern above. The file has 5 `describe` blocks at minimum — `Event`, `State`, `Transition`, `Process`, `Statemachine` — and tests like "should manage transitions" that directly construct `State`/`Transition`.

Key patterns:

- For `describe("State")` / `describe("Transition")` / `describe("Process")`: rewrite to test the _behaviour_ of the resulting `Process` from a builder, not direct construction. Tests that previously asserted `state.addTransition` works become tests that the builder's `addTransition` produces the right result.
- `describe("Event")` is unaffected — `Event` is still constructible (it's used by Dispatcher commands and is part of the public API).
- `describe("Statemachine")`: replace constructor calls with options-object form; replace `attach`/`update` with `attachAfter`/`AfterTransitionObserver`.

- [ ] **Step 1: Rewrite the file**

Read `tests/core.test.ts` fully, then rewrite each `describe` block. Here is the converted shape — apply the same pattern to every test:

```ts
// Before (v2):
it("should manage transitions", () => {
  const s1 = new State("s1");
  const s2 = new State("s2");
  const t = new Transition(s2, "go");
  s1.addTransition(t);
  // ...
});

// After (v3):
it("manages transitions through the builder", () => {
  const process = new ProcessBuilder("p")
    .addState("s1", { initial: true })
    .addState("s2")
    .addTransition("s1", "s2", { event: "go" })
    .build();
  const s1 = process.getState("s1");
  const transitions = Array.from(s1.getTransitions());
  expect(transitions).toHaveLength(1);
  expect(transitions[0]!.getTargetState().getName()).toBe("s2");
});
```

For the `Statemachine` block:

```ts
// Before:
const sm = new Statemachine(
  subject,
  process,
  "s1",
  new OneOrNoneActiveTransition(),
  null,
);
sm.attach(observer);

// After:
const sm = new Statemachine(subject, process, {
  initialStateName: "s1",
  transitionSelector: new OneOrNoneActiveTransition(),
});
sm.attachAfter(observer);
```

For tests that asserted observer-context (`getSelectedTransition`, `getCurrentContext`): rewrite the observer to capture the frame and assert on the captured frame.

```ts
import type {
  TransitionFrame,
  AfterTransitionObserver,
  EnqueueContext,
} from "../src/index.js";

class CapturingObserver implements AfterTransitionObserver {
  frames: TransitionFrame[] = [];
  notify(frame: TransitionFrame, _ctx: EnqueueContext): void {
    this.frames.push(frame);
  }
}

it("notifies observers on transition", async () => {
  // ... build process ...
  const sm = new Statemachine({}, process);
  const cap = new CapturingObserver();
  sm.attachAfter(cap);
  await sm.triggerEvent("go");
  expect(cap.frames).toHaveLength(1);
  expect(cap.frames[0]!.fromState.getName()).toBe("s1");
  expect(cap.frames[0]!.toState.getName()).toBe("s2");
});
```

- [ ] **Step 2: Run the converted suite**

```
pnpm vitest run tests/core.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/core.test.ts
git commit -m "test(core): convert to v3 API (ProcessBuilder, frame observers)"
```

---

## Task 6.2: Convert `tests/exception-cleanup.test.ts`

**Files:**

- Modify: `tests/exception-cleanup.test.ts`

Conversion pattern:

- The helper `createTwoStateMachine` becomes:
  ```ts
  function createTwoStateMachine(mutex?: MutexInterface) {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    return new Statemachine({}, process, mutex ? { mutex } : {});
  }
  ```
- Tests that asserted post-throw transient fields (`getCurrentContext()`, `getSelectedTransition()`, `getLastState()`) are dropped — those getters are gone. Replace with:
  - For `getCurrentContext` → assertion now verified by `lastState` + `currentState` invariants (state advanced; context was scoped to the operation).
  - For `getSelectedTransition` → drop entirely; observers see selected transition via frame, not via SM.
  - For `getLastState` → keep; `lastState` is now the committed predecessor of `currentState`. After a SM-observer throw, `currentState` is `s2` and `lastState` is `s1`.
- Event-observer tests (`getEvent("go").attach(...)`) keep working; events are still attached via the legacy `Observer` interface and dispatched internally.

- [ ] **Step 1: Rewrite the file**

Apply the pattern. Key concrete updates:

```ts
// Helper:
import type {
  MutexInterface,
  AfterTransitionObserver,
  BeforeTransitionObserver,
  TransitionFrame,
  ProposedTransitionFrame,
  EnqueueContext,
} from "../src/index.js";
import { ProcessBuilder, Statemachine /* ... */ } from "../src/index.js";

function createTwoStateMachine(mutex?: MutexInterface) {
  const process = new ProcessBuilder("test")
    .addState("s1", { initial: true })
    .addState("s2")
    .addTransition("s1", "s2", { event: "go" })
    .build();
  return new Statemachine({}, process, mutex ? { mutex } : {});
}

// Updated test for "throwing event observer leaves state unchanged":
it("should leave state unchanged when event observer throws (pre-transition)", async () => {
  const sm = createTwoStateMachine();
  // event observers (commands) still attach via Event:
  sm.getProcess()
    .getState("s1")
    .getEvent("go")
    .attach(
      new CallbackObserver(() => {
        throw new Error("event observer error");
      }),
    );
  await expect(sm.triggerEvent("go")).rejects.toThrow();
  expect(sm.getCurrentState().getName()).toBe("s1");
});

// Updated test for "throwing AFTER observer advances state":
it("advances currentState even when after-observer throws", async () => {
  const sm = createTwoStateMachine();
  const throwing: AfterTransitionObserver = {
    notify(_frame: TransitionFrame, _ctx: EnqueueContext): void {
      throw new Error("after observer error");
    },
  };
  sm.attachAfter(throwing);
  await expect(sm.triggerEvent("go")).rejects.toThrow("after observer error");
  expect(sm.getCurrentState().getName()).toBe("s2");
  expect(sm.getLastState()!.getName()).toBe("s1");
});
```

Drop the test "should clear transient fields when SM observer throws" — the v3 contract is "no transient fields"; replace with a frame-based assertion as needed (the previous test already covered the assertion that matters).

- [ ] **Step 2: Run the suite**

```
pnpm vitest run tests/exception-cleanup.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/exception-cleanup.test.ts
git commit -m "test(exception-cleanup): convert to v3 frame-based observers"
```

---

## Task 6.3: Convert `tests/observer.test.ts`

**Files:**

- Modify: `tests/observer.test.ts`

Conversion notes:

- `StatefulStatusChanger` constructor now takes the subject. Update tests:
  ```ts
  const subject: StatefulInterface = {
    /*...*/
  };
  sm.attachAfter(new StatefulStatusChanger(subject));
  ```
- `OnEnterObserver` is now an after-observer that enqueues. Tests should assert that:
  - The chained event eventually fires (e.g., the callback registered for `"onEnter"` is called).
  - **For #2 regression hint:** if a second `attachAfter(otherObserver)` is registered after `OnEnterObserver`, `otherObserver`'s frame is the _original_ transition's frame, not the chained one.
- `TransitionLogger` test: replace `subject.getCurrentState()` reads with frame-based reads in the logger; the test passes the logger and asserts on the recorded message, which now lacks subject identity unless the user supplies it. Adjust assertions accordingly.

- [ ] **Step 1: Rewrite the file**

Apply the conversion. For `OnEnterObserver` test:

```ts
it("triggers onEnter event when entering a state (queued)", async () => {
  const onEnterFn = vi.fn();
  const process = new ProcessBuilder("p")
    .addState("s1", { initial: true })
    .addState("s2")
    .addTransition("s1", "s2", { event: "go" })
    .addTransition("s2", "s2", { event: "onEnter" })
    .build();
  // event observer (command) attached to s2's onEnter event:
  process
    .getState("s2")
    .getEvent("onEnter")
    .attach(new CallbackObserver(onEnterFn));

  const sm = new Statemachine({}, process);
  sm.attachAfter(new OnEnterObserver());
  await sm.triggerEvent("go");
  // After triggerEvent resolves, the OnEnter chain has been enqueued.
  // The runIfIdle loop drains it before returning.
  expect(onEnterFn).toHaveBeenCalled();
  expect(sm.getCurrentState().getName()).toBe("s2");
});
```

- [ ] **Step 2: Run and commit**

```
pnpm vitest run tests/observer.test.ts
```

Expected: PASS.

```bash
git add tests/observer.test.ts
git commit -m "test(observer): convert to v3; OnEnterObserver verified queue-driven"
```

---

## Task 6.4: Convert `tests/factory.test.ts`

**Files:**

- Modify: `tests/factory.test.ts`

- [ ] **Step 1: Apply the v3 conversion pattern**

Replace `attachStatemachineObserver` calls with `attachAfterObserver` (or `attachBeforeObserver`); update process construction to use `ProcessBuilder`; update Statemachine constructor expectations in any spy/assert.

- [ ] **Step 2: Run and commit**

```
pnpm vitest run tests/factory.test.ts
```

Expected: PASS.

```bash
git add tests/factory.test.ts
git commit -m "test(factory): convert to v3 API"
```

---

## Task 6.5: Convert `tests/integration.test.ts`

**Files:**

- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Convert all scenarios**

Apply the standard pattern. End-to-end scenarios may be the longest; ensure each `Statemachine` instance is built via `new Statemachine(subject, process, {})` and observers are attached as `attachAfter`/`attachBefore`.

- [ ] **Step 2: Run and commit**

```
pnpm vitest run tests/integration.test.ts
```

```bash
git add tests/integration.test.ts
git commit -m "test(integration): convert to v3 API"
```

---

## Task 6.6: Convert `tests/mutex.test.ts`

**Files:**

- Modify: `tests/mutex.test.ts`

Specifics:

- Update Statemachine constructions to use options-object.
- Add a regression test for the v3 contract that `acquireLock` no longer short-circuits on `isAcquired`:

```ts
it("does not short-circuit when isAcquired returns true (closes #1)", async () => {
  const fakeMutex: MutexInterface = {
    acquireLock: vi.fn(async () => false),
    releaseLock: vi.fn(async () => {}),
    isAcquired: vi.fn(() => true), // claims to be already-held
  };
  const process = new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();
  const sm = new Statemachine({}, process, { mutex: fakeMutex });
  await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
    LockCanNotBeAcquiredError,
  );
  expect(fakeMutex.acquireLock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 1: Convert and add the regression test**

- [ ] **Step 2: Run and commit**

```
pnpm vitest run tests/mutex.test.ts
```

```bash
git add tests/mutex.test.ts
git commit -m "test(mutex): convert to v3; add no-short-circuit regression"
```

---

## Task 6.7: Convert remaining test files

**Files:**

- Modify: `tests/condition.test.ts`, `tests/filter.test.ts`, `tests/selector.test.ts`, `tests/generics.test.ts`, `tests/graph.test.ts`

Each is a mechanical conversion (no observer logic). Apply the pattern.

- [ ] **Step 1: Convert all five files**

For each file, replace `new State`/`new Transition`/`new Process`/`new Statemachine(...)` calls with `ProcessBuilder` + options-object `Statemachine`. Filters and selectors operate on `Iterable<TransitionInterface>` from a `process.getState(...).getTransitions()` — the data shape is unchanged.

- [ ] **Step 2: Run all converted suites**

```
pnpm vitest run tests/condition.test.ts tests/filter.test.ts \
                tests/selector.test.ts tests/generics.test.ts \
                tests/graph.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/condition.test.ts tests/filter.test.ts tests/selector.test.ts \
        tests/generics.test.ts tests/graph.test.ts
git commit -m "test: convert remaining suites to v3 API"
```

---

## Task 6.8: Regression suite for #1 — concurrency

**Files:**

- Modify: `tests/concurrency.test.ts` (replace the smoke tests with the full suite)

- [ ] **Step 1: Write the full suite**

Replace `tests/concurrency.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  Tautology,
  LockCanNotBeAcquiredError,
} from "../src/index.js";
import type {
  AfterTransitionObserver,
  BeforeTransitionObserver,
  EnqueueContext,
  TransitionFrame,
  ProposedTransitionFrame,
  MutexInterface,
} from "../src/index.js";

describe("Concurrency — same-instance serialization (closes #1)", () => {
  it("queues a second triggerEvent while the first is mid-flight", async () => {
    const order: string[] = [];

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "first" })
      .addTransition("b", "c", { event: "second" })
      .build();
    const sm = new Statemachine({}, process);

    let releaseFirst: () => void;
    const firstPause = new Promise<void>((r) => {
      releaseFirst = r;
    });

    sm.attachAfter({
      async notify(frame: TransitionFrame): Promise<void> {
        if (frame.event?.getName() === "first") {
          order.push("first-after-start");
          await firstPause;
          order.push("first-after-end");
        } else if (frame.event?.getName() === "second") {
          order.push("second-after");
        }
      },
    });

    const p1 = sm.triggerEvent("first");
    const p2 = sm.triggerEvent("second");

    // Allow the first observer to start, then release it after a tick.
    await new Promise((r) => setTimeout(r, 10));
    releaseFirst!();

    await Promise.all([p1, p2]);

    expect(order).toEqual([
      "first-after-start",
      "first-after-end",
      "second-after",
    ]);
    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("queues checkTransitions behind an in-flight triggerEvent", async () => {
    // Setup: triggerEvent moves a→b; checkTransitions then moves b→c via auto.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { condition: new Tautology() })
      .build();
    const sm = new Statemachine({}, process);

    let release: () => void;
    const pause = new Promise<void>((r) => {
      release = r;
    });

    let observedDuringTrigger: string | null = null;
    sm.attachAfter({
      async notify(frame: TransitionFrame): Promise<void> {
        if (frame.toState.getName() === "b") {
          observedDuringTrigger = sm.getCurrentState().getName();
          await pause;
        }
      },
    });

    const p1 = sm.triggerEvent("go");
    const p2 = sm.checkTransitions();

    await new Promise((r) => setTimeout(r, 10));
    release!();
    await Promise.all([p1, p2]);

    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("acquires the mutex exactly once per top-level operation", async () => {
    const acquireCalls: number[] = [];
    let acquired = false;
    const mutex: MutexInterface = {
      acquireLock: vi.fn(async () => {
        acquireCalls.push(Date.now());
        acquired = true;
        return true;
      }),
      releaseLock: vi.fn(async () => {
        acquired = false;
      }),
      isAcquired: vi.fn(() => acquired),
    };

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "a", { event: "back" })
      .build();
    const sm = new Statemachine({}, process, { mutex });

    await sm.triggerEvent("go");
    await sm.triggerEvent("back");
    expect(mutex.acquireLock).toHaveBeenCalledTimes(2);
    expect(mutex.releaseLock).toHaveBeenCalledTimes(2);
  });

  it("LockCanNotBeAcquiredError when mutex.acquireLock returns false", async () => {
    const mutex: MutexInterface = {
      acquireLock: async () => false,
      releaseLock: async () => {},
      isAcquired: () => false,
    };
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process, { mutex });
    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
      LockCanNotBeAcquiredError,
    );
  });
});
```

- [ ] **Step 2: Run and commit**

```
pnpm vitest run tests/concurrency.test.ts
```

Expected: PASS.

```bash
git add tests/concurrency.test.ts
git commit -m "test(concurrency): regression suite for IMPLEMENTATION_REVIEW.md #1"
```

---

## Task 6.9: Regression suite for #2 and #4 — observer ordering and frames

**Files:**

- Create: `tests/observer-frame.test.ts`

- [ ] **Step 1: Write the suite**

```ts
import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  OnEnterObserver,
  CallbackObserver,
} from "../src/index.js";
import type {
  AfterTransitionObserver,
  BeforeTransitionObserver,
  EnqueueContext,
  TransitionFrame,
  ProposedTransitionFrame,
} from "../src/index.js";

describe("Observer frames and ordering (closes #2, #4)", () => {
  it("after-observer registered after OnEnterObserver sees original frame, not chained (#2)", async () => {
    const observed: { from: string; to: string }[] = [];

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);

    sm.attachAfter(new OnEnterObserver());
    sm.attachAfter({
      notify(frame: TransitionFrame): void {
        observed.push({
          from: frame.fromState.getName(),
          to: frame.toState.getName(),
        });
      },
    });

    await sm.triggerEvent("go");

    // Two transitions happened: a→b (event "go") and b→c (event "onEnter").
    // Each one's after-observer pass sees its own frame; the `observed`
    // recorder runs once per transition with that transition's frame.
    expect(observed).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("on-enter chained event runs as its own top-level operation", async () => {
    let chainedSawFromB = false;

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);

    sm.attachAfter(new OnEnterObserver());
    sm.attachAfter({
      notify(frame: TransitionFrame): void {
        if (frame.event?.getName() === "onEnter") {
          chainedSawFromB = frame.fromState.getName() === "b";
        }
      },
    });

    await sm.triggerEvent("go");

    expect(chainedSawFromB).toBe(true);
  });

  it("frame is frozen", async () => {
    let captured: TransitionFrame | null = null;
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(frame: TransitionFrame): void {
        captured = frame;
      },
    });
    await sm.triggerEvent("go");
    expect(Object.isFrozen(captured!)).toBe(true);
  });

  it("BeforeTransitionObserver may veto by throwing (#4)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    let afterCalled = false;
    sm.attachBefore({
      notify(_frame: ProposedTransitionFrame): void {
        throw new Error("veto");
      },
    });
    sm.attachAfter({
      notify(_frame: TransitionFrame): void {
        afterCalled = true;
      },
    });
    await expect(sm.triggerEvent("go")).rejects.toThrow("veto");
    expect(sm.getCurrentState().getName()).toBe("a");
    expect(afterCalled).toBe(false);
  });

  it("AfterTransitionObserver throw does not roll back state (#4)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_frame: TransitionFrame): void {
        throw new Error("kaboom");
      },
    });
    await expect(sm.triggerEvent("go")).rejects.toThrow("kaboom");
    expect(sm.getCurrentState().getName()).toBe("b");
    expect(sm.getLastState()!.getName()).toBe("a");
  });

  it("multiple after-observers all run; AggregateError when more than one throws", async () => {
    const calls: string[] = [];
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        calls.push("o1");
        throw new Error("e1");
      },
    });
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        calls.push("o2");
      },
    });
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        calls.push("o3");
        throw new Error("e3");
      },
    });
    let caught: unknown;
    try {
      await sm.triggerEvent("go");
    } catch (err) {
      caught = err;
    }
    expect(calls).toEqual(["o1", "o2", "o3"]);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(2);
    expect((caught as AggregateError).errors[0]!.message).toBe("e1");
    expect((caught as AggregateError).errors[1]!.message).toBe("e3");
  });

  it("single after-observer throw rethrown directly (not wrapped)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        throw new Error("only-one");
      },
    });
    await expect(sm.triggerEvent("go")).rejects.toThrow("only-one");
    // Not an AggregateError when only one observer threw.
    let caught: unknown;
    try {
      await new Promise<void>(() => {
        // never resolves; we just want to inspect the type from above
      });
    } catch {
      // unreachable
    }
    // Re-issue and capture type:
    const sm2 = new Statemachine({}, process);
    sm2.attachAfter({
      notify(_f: TransitionFrame): void {
        throw new Error("only-one");
      },
    });
    let caught2: unknown;
    try {
      await sm2.triggerEvent("go");
    } catch (err) {
      caught2 = err;
    }
    expect(caught2).not.toBeInstanceOf(AggregateError);
    expect((caught2 as Error).message).toBe("only-one");
  });
});
```

- [ ] **Step 2: Run and commit**

```
pnpm vitest run tests/observer-frame.test.ts
```

Expected: PASS.

```bash
git add tests/observer-frame.test.ts
git commit -m "test(observer-frame): regression suite for IMPLEMENTATION_REVIEW.md #2 and #4"
```

---

## Task 6.10: Run the full test suite

**Files:** none (verification step).

- [ ] **Step 1: Run everything**

```
pnpm test
```

Expected: PASS for all converted and new tests. The total test count will differ from v2's 217 because some tests on removed APIs were dropped and new regression tests were added.

If any tests fail, fix them and commit each fix individually.

- [ ] **Step 2: Run lint and format check**

```
pnpm run lint
pnpm run format:check
```

Expected: PASS.

- [ ] **Step 3: Spot-check with a build**

```
pnpm run build
```

Expected: PASS.

---

# Phase 7 — Documentation, Migration Guide, Version Bump

## Task 7.1: Migration guide

**Files:**

- Create: `docs/migration/v2-to-v3.md`

- [ ] **Step 1: Write the guide**

Write `docs/migration/v2-to-v3.md`:

````markdown
# Migrating from v2 to v3

`@camcima/finita` v3.0.0 is a breaking change release that addresses architectural correctness issues in the execution engine and graph construction. This guide walks each public API change with before/after examples.

The safest verification path is running your existing test suite against v3; many migrations are mechanical and surface as type errors first.

---

## 1. Building a process — `ProcessBuilder` replaces direct construction

**Before (v2):**

```ts
import { State, Transition, Process } from "@camcima/finita";

const draft = new State("draft");
const submitted = new State("submitted");
draft.addTransition(new Transition(submitted, "submit"));
const process = new Process("orderFulfillment", draft);
```
````

**After (v3):**

```ts
import { ProcessBuilder } from "@camcima/finita";

const process = new ProcessBuilder("orderFulfillment")
  .addState("draft", { initial: true })
  .addState("submitted")
  .addTransition("draft", "submitted", { event: "submit" })
  .build();
```

`State`, `Transition`, and `Process` are still exported but their constructors are no longer user-callable. Calling `new State("foo")` from your own code throws at runtime.

The builder validates the graph at `build()` time; missing initial states, unknown transition targets, empty event names, and conflicting duplicate transitions are typed errors (`GraphValidationError`, `DuplicateTransitionError`).

## 2. Statemachine constructor — options object

**Before (v2):**

```ts
const sm = new Statemachine(
  subject,
  process,
  "draft",
  new OneOrNoneActiveTransition(),
  mutex,
);
```

**After (v3):**

```ts
const sm = new Statemachine(subject, process, {
  initialStateName: "draft",
  transitionSelector: new OneOrNoneActiveTransition(),
  mutex,
});
```

All options are optional. `autoreleaseLock` defaults to `true`.

## 3. Observers — split into `before` and `after`

**Before (v2):** a single `Observer` interface with `update(subject)` was attached via `sm.attach(observer)`. Implementations pulled fields off the subject.

**After (v3):** two interfaces with distinct contracts.

- `BeforeTransitionObserver` runs against a `ProposedTransitionFrame`; throwing aborts the transition.
- `AfterTransitionObserver` runs against a frozen `TransitionFrame` after commit; throwing does not roll back state but is reported.

```ts
import type {
  BeforeTransitionObserver,
  AfterTransitionObserver,
  TransitionFrame,
  ProposedTransitionFrame,
  EnqueueContext,
} from "@camcima/finita";

class Auditor implements AfterTransitionObserver {
  notify(frame: TransitionFrame, ctx: EnqueueContext): void {
    console.log(
      `Transition from ${frame.fromState.getName()} to ${frame.toState.getName()}`,
    );
  }
}

const sm = new Statemachine(subject, process);
sm.attachAfter(new Auditor());
```

Migration rule of thumb:

- Logic that **validates or vetoes** transitions → `attachBefore`.
- Logic that **logs, syncs, or chains** events → `attachAfter`.

## 4. Frames replace mutable observer-context fields

`getSelectedTransition()`, `getCurrentContext()`, and the legacy `currentEvent` getter on `Statemachine` are removed. Read these from the frame parameter inside an observer.

`getLastState()` is retained and now consistent: it always returns the immediate predecessor of `currentState`.

## 5. `OnEnterObserver` runs queued, not nested

`OnEnterObserver` is now an `AfterTransitionObserver`. Its `notify` _enqueues_ the chained event instead of running it inline. Other after-observers registered after `OnEnterObserver` see the original transition's frame, not the chained one.

If your code asserted that a logger registered after `OnEnterObserver` saw the chained transition, those assertions need updating.

## 6. Concurrency — same-instance calls serialize

In v2, calling `triggerEvent` while another `triggerEvent` was in flight on the same `Statemachine` instance threw `"Event dispatching is still running!"`. In v3, the second call is queued and runs after the first completes. Same for `checkTransitions`.

If your code relied on the throw to detect a race condition, replace it with explicit serialization at the application layer (e.g., debounce or mutex).

## 7. Mutex — no `isAcquired()` short-circuit

`Statemachine.acquireLock()` now always delegates to `mutex.acquireLock()`. A mutex implementation whose `isAcquired()` returns `true` but whose `acquireLock()` returns `false` will cause the operation to fail with `LockCanNotBeAcquiredError`. This is the intended contract; v2's short-circuit hid bugs.

## 8. Removed APIs

| Removed                                   | Replacement                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| `new State("...")`                        | `ProcessBuilder.addState`                                 |
| `new Transition(...)`                     | `ProcessBuilder.addTransition`                            |
| `new Process(...)`                        | `ProcessBuilder.build()`                                  |
| `state.addTransition(...)`                | `ProcessBuilder.addTransition`                            |
| `transition.setWeight(...)`               | `ProcessBuilder.addTransition({ weight })`                |
| `state.setMetadataValue(...)`             | `ProcessBuilder.addState({ metadata })`                   |
| `sm.attach(observer)`                     | `sm.attachBefore(observer)` or `sm.attachAfter(observer)` |
| `sm.notify()`, `sm.getObservers()`        | n/a — observer notification is internal                   |
| `sm.dispatchEvent(dispatcher, name, ...)` | `sm.triggerEvent(name, ...)` (sole entry point)           |
| `sm.getSelectedTransition()`              | frame parameter inside `AfterTransitionObserver`          |
| `sm.getCurrentContext()`                  | frame parameter inside observer                           |
| `Dispatcher`                              | internal — not exported                                   |
| `StateCollection`                         | internal — not exported                                   |
| `SetupHelper`                             | use `ProcessBuilder` directly                             |
| `StateCollectionMerger`                   | use `ProcessBuilder` directly                             |

## 9. New error classes

| Class                      | When                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `ProcessFinalizedError`    | `ProcessBuilder.build()` called twice                                                         |
| `GraphValidationError`     | unknown source/target, missing/multiple initial state, empty event name, orphan (strict mode) |
| `DuplicateTransitionError` | two transitions with the same `(from, event, to)` and conflicting condition objects           |

## 10. After-observer error aggregation

When multiple after-observers throw, the caller's promise rejects with a standard `AggregateError` whose `errors` array contains the thrown errors in invocation order. When exactly one throws, the caller receives that error directly.

## 11. `StatefulStatusChanger` constructor

`StatefulStatusChanger` now takes the subject at construction:

```ts
sm.attachAfter(new StatefulStatusChanger(subject));
```

The v2 reflective subject lookup is gone; explicit injection makes the contract typed.

````

- [ ] **Step 2: Verify and commit**

```bash
git add docs/migration/v2-to-v3.md
git commit -m "docs(migration): add v2-to-v3 migration guide"
````

---

## Task 7.2: Update existing docs to v3 examples

**Files:**

- Modify: `docs/core.md`, `docs/observers.md`, `docs/conditions.md`, `docs/filters.md`, `docs/selectors.md`, `docs/factory.md`, `docs/mutex.md`, `docs/graph.md`, `docs/utilities.md`, `docs/errors.md`, `docs/interfaces.md`, `README.md`

- [ ] **Step 1: Convert each doc file's code examples**

For each doc file, replace v2 code blocks with v3 equivalents using the same conversion pattern as the test files. Specifically:

- `new State`/`new Transition`/`new Process` → `ProcessBuilder` chain.
- `new Statemachine(subject, process, name, selector, mutex)` → options object.
- `Observer` examples → `BeforeTransitionObserver` / `AfterTransitionObserver`.
- Update prose where it described removed methods.

For `docs/utilities.md` specifically: remove sections on `SetupHelper` and `StateCollectionMerger`; add a note that they were removed in v3 with a pointer to the migration guide.

For `docs/observers.md`: rewrite to introduce the two-phase model and frame parameter; document `OnEnterObserver`'s queued semantics.

For `docs/core.md`: update the quick-start example.

For `README.md`: update the badge (TypeScript version, Node versions per `engines` if Sub-project D is in scope; otherwise leave Node badge alone) and the quick-start.

> **Note on Sub-project E (doc drift):** This task is only for _example correctness_ — replacing v2 syntax with v3. It is NOT scope for fixing review findings #8/#9/#10/#11 (those describe documented behaviour that doesn't exist or is misleading). Those are addressed in Sub-project E.

- [ ] **Step 2: Verify Markdown lint/format**

```
pnpm run format:check
```

If files are flagged, run `pnpm run format` and re-stage.

- [ ] **Step 3: Commit**

```bash
git add docs/ README.md
git commit -m "docs: update examples to v3 API (ProcessBuilder, frame observers)"
```

---

## Task 7.3: Bump version to 3.0.0

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Edit `package.json`**

Change:

```json
"version": "2.2.0",
```

to:

```json
"version": "3.0.0",
```

- [ ] **Step 2: Run final verification**

```
pnpm test && pnpm run lint && pnpm run format:check && pnpm run build
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(release): bump to 3.0.0"
```

---

## Task 7.4: Final repo health check

- [ ] **Step 1: Run the complete pipeline**

```
pnpm test && pnpm run lint && pnpm run format:check && pnpm run build
```

- [ ] **Step 2: Verify the package contents**

```
pnpm pack --dry-run
```

Expected: `dist/` is included; `LICENSE`, `README.md`, `package.json` present.

- [ ] **Step 3: Inspect the git log**

```
git log --oneline main..HEAD
```

Expected: a clean sequence of commits per phase, all signed off as in this plan.

- [ ] **Step 4: No commit needed**

The plan is complete. v3.0.0 is ready for release.

---

# Notes for the Implementer

## When tests change behavior subtly

A few v2 tests assert behaviors that v3 explicitly changes:

- **"should clear transient fields"** in `tests/exception-cleanup.test.ts` — v3 has no transient fields. Drop these tests; the behavior is now "no fields to clear because there are none".
- **OnEnterObserver tests** that assumed observers see the chained transition's frame — flip the assertion.
- **Observer-context reads from outside notification** — these tests are already invalid; rewrite to use frames inside an observer or to use `getLastState()` after the call.

If a v2 test seems to "almost work" with a small tweak — pause and ask whether the test was asserting v2-specific behavior that v3 deliberately changes. If yes, drop or rewrite; do not bend the v3 implementation to match.

## Performance is non-goal

The plan introduces a queue, frame allocation per transition, and a triple-pass builder. This is acceptable for v3.0; performance work is a separate concern.

## Subject identity in `TransitionLogger`

`TransitionFrame` does not carry subject identity. `TransitionLogger` in v3 logs without subject context. If a user wants subject info in their logs, the migration guide directs them to subclass `TransitionLogger` and inject the `Statemachine` (or subject) at construction time. This is intentional — frames are about the transition, not the subject.

## Avoiding accidental scope creep

The following appeared in the source review but are explicitly **not** in scope for this plan:

- Finding #5 broader cleanup (whitespace event names _outside_ the builder; wider `string | null` consistency).
- Finding #6 silent dedup wider than the builder's identity rules.
- Finding #12 (more error classes for runtime failures).
- Finding #13 (tighter type guards).
- Finding #14 (`GraphBuilder` edge dedup).
- Findings #7, #8, #9, #10, #11 (release packaging, README/metadata, doc drift).

Stay focused. Do not refactor adjacent code that "looks easy" — open a follow-up issue instead.
