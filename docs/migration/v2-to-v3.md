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

### Awaiting the chain to drain

Because the chained event runs as a **separate top-level operation**, it has not necessarily completed by the time `await sm.triggerEvent(...)` resolves. The original caller's promise resolves when its own operation finishes — chained operations are then drained on subsequent microtasks. If your code reads `currentState` immediately after `await`, you may observe the pre-chain state.

To wait for the queue to fully drain, yield once:

```ts
await sm.triggerEvent("go");
await new Promise((r) => setTimeout(r, 0)); // allow the OnEnter chain to drain
expect(sm.getCurrentState().getName()).toBe("c"); // chained target
```

This pattern is what the regression test suite uses. A future release may add an explicit `sm.waitIdle()` API.

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

## 12. Typed errors with a shared `FinitaError` base

All library errors now extend an abstract `FinitaError` base that carries a
`code: string` discriminant. Code that previously matched on a generic
`Error` message can switch to a typed `instanceof` check or a `code` switch:

```ts
import { FinitaError } from "@camcima/finita";

try {
  await sm.triggerEvent("go");
} catch (err) {
  if (err instanceof FinitaError) {
    switch (err.code) {
      case "wrongEventForState":
        /* ... */ break;
      case "automaticTransitionCycle":
        /* ... */ break;
      default: /* ... */
    }
  }
  throw err;
}
```

Throw sites that previously raised generic `new Error(...)` now raise typed
classes. Existing message strings are preserved (or extended with structured
prefixes), so substring matchers continue to work; classes are the
recommended check.

| Old throw site                                            | New error class                 | `code`                       |
| --------------------------------------------------------- | ------------------------------- | ---------------------------- |
| `StateCollection.getState(name)` not found                | `StateNotFoundError`            | `"stateNotFound"`            |
| `State.getEvent(name)` not declared                       | `StateEventNotFoundError`       | `"stateEventNotFound"`       |
| `AbstractNamedProcessDetector.detectProcess` unknown name | `ProcessNotFoundError`          | `"processNotFound"`          |
| `StatefulStateNameDetector` non-stateful subject          | `InvalidSubjectError`           | `"invalidSubject"`           |
| `OneOrNoneActiveTransition.selectTransition` ambiguous    | `AmbiguousTransitionError`      | `"ambiguousTransition"`      |
| `Statemachine` automatic-transition cycle                 | `AutomaticTransitionCycleError` | `"automaticTransitionCycle"` |

The retrofitted classes from earlier tasks pick up matching codes:

| Class                       | `code`                                |
| --------------------------- | ------------------------------------- |
| `DuplicateStateError`       | `"duplicateState"`                    |
| `DuplicateTransitionError`  | `"duplicateTransition"`               |
| `GraphValidationError`      | (existing `GraphValidationCode` enum) |
| `LockCanNotBeAcquiredError` | `"lockCanNotBeAcquired"`              |
| `ProcessFinalizedError`     | `"processFinalized"`                  |
| `WrongEventForStateError`   | `"wrongEventForState"`                |

## 13. Stricter event-name and condition-name validation

`ProcessBuilder.addTransition` now rejects:

- Event names that are empty, whitespace-only, **or** contain leading/trailing
  whitespace. Code: `GraphValidationError` with `code: "invalidEventName"`.
- `ConditionInterface` instances whose `getName()` returns an empty or
  whitespace-only string. Code: `GraphValidationError` with
  `code: "invalidConditionName"`.

The `GraphValidationCode` union has changed: the literal `"emptyEventName"`
is **removed** in favour of `"invalidEventName"` (which covers both empty
and padded names) and `"invalidConditionName"` is added.

If you trigger this in v3.0.0, trim the names before passing them in.

## 14. `GraphBuilder.addState` is now idempotent

Calling `GraphBuilder.addState(s)` twice for the same state previously
deduplicated the node but appended duplicate edges. In v3.0.0 the second
call is a no-op for both nodes and edges. If you relied on the old
duplicate-edge behaviour, instantiate a fresh `GraphBuilder` per pass.
