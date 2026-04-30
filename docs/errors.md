# Errors

Custom error classes thrown by the state machine.

## Table of Contents

- [WrongEventForStateError](#wrongeventforstateerror)
- [LockCanNotBeAcquiredError](#lockcannotbeacquirederror)
- [DuplicateStateError](#duplicatestateerror)
- [ProcessFinalizedError](#processfinalizederror)
- [GraphValidationError](#graphvalidationerror)
- [DuplicateTransitionError](#duplicatetransitionerror)
- [Automatic Transition Cycle Error](#automatic-transition-cycle-error)

---

## WrongEventForStateError

**Import:** `import { WrongEventForStateError } from '@camcima/finita'`

Thrown when `triggerEvent()` is called with an event name that doesn't exist on the current state.

### Properties

| Property    | Type     | Description                                                      |
| ----------- | -------- | ---------------------------------------------------------------- |
| `stateName` | `string` | The name of the state that doesn't have the event                |
| `eventName` | `string` | The event name that was triggered                                |
| `message`   | `string` | `'Current state "{stateName}" doesn't have event "{eventName}"'` |
| `name`      | `string` | `'WrongEventForStateError'`                                      |

### Example

```typescript
import { WrongEventForStateError } from "@camcima/finita";

try {
  await statemachine.triggerEvent("nonexistent");
} catch (error) {
  if (error instanceof WrongEventForStateError) {
    console.log(
      `State "${error.stateName}" doesn't support "${error.eventName}"`,
    );
    // Show available events:
    console.log(
      "Available events:",
      statemachine.getCurrentState().getEventNames(),
    );
  }
}
```

### When It's Thrown

This error is thrown by `Statemachine.dispatchEvent()` when the current state does not have the requested event. Check `state.hasEvent(name)` before triggering to avoid this error:

```typescript
if (statemachine.getCurrentState().hasEvent("approve")) {
  await statemachine.triggerEvent("approve");
} else {
  console.log("Cannot approve from this state");
}
```

---

## LockCanNotBeAcquiredError

**Import:** `import { LockCanNotBeAcquiredError } from '@camcima/finita'`

Thrown when the state machine cannot acquire its lock before processing an event or checking transitions.

### Properties

| Property  | Type     | Description                   |
| --------- | -------- | ----------------------------- |
| `message` | `string` | `'Lock can not be acquired!'` |

### Example

```typescript
import { LockCanNotBeAcquiredError } from "@camcima/finita";

try {
  await statemachine.triggerEvent("process");
} catch (error) {
  if (error instanceof LockCanNotBeAcquiredError) {
    console.log("State machine is locked -- another operation is in progress");
    // Retry later or queue the event
  }
}
```

### When It's Thrown

This error is thrown when:

- `triggerEvent()` is called but the mutex `acquireLock()` returns `false`
- `checkTransitions()` is called but the mutex `acquireLock()` returns `false`

With the default `NullMutex`, this error is never thrown because `acquireLock()` always returns `true`. It only occurs when using a real locking mechanism (e.g., `LockAdapterMutex`) and the lock is held by another process.

---

## DuplicateStateError

**Import:** `import { DuplicateStateError } from '@camcima/finita'`

Thrown when a `StateCollection` or `Process` constructor encounters a different state instance with the same name. Since `Process` is immutable after construction, this error occurs during the constructor's automatic graph discovery when two distinct state objects share a name.

### Properties

| Property    | Type     | Description                                                                       |
| ----------- | -------- | --------------------------------------------------------------------------------- |
| `stateName` | `string` | The duplicate state name                                                          |
| `message`   | `string` | `'There is already a different state with name "{stateName}" in this collection'` |
| `name`      | `string` | `'DuplicateStateError'`                                                           |

### Example

```typescript
import { DuplicateStateError, ProcessBuilder } from "@camcima/finita";

try {
  new ProcessBuilder("example")
    .addState("open", { initial: true })
    .addState("open"); // Duplicate name — throws
} catch (error) {
  if (error instanceof DuplicateStateError) {
    console.log(`Duplicate state: "${error.stateName}"`);
  }
}
```

### When It's Thrown

- `ProcessBuilder.addState()` is called with a name that was already declared

---

## ProcessFinalizedError

**Import:** `import { ProcessFinalizedError } from '@camcima/finita'`

Thrown when `ProcessBuilder.build()` is called more than once on the same builder instance. A builder is single-use: once `build()` succeeds, the builder is finalized and all further mutations or build calls are rejected.

### Properties

| Property      | Type     | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `processName` | `string` | The name of the finalized process                        |
| `message`     | `string` | Contains the process name and a description of the error |
| `name`        | `string` | `'ProcessFinalizedError'`                                |

### Example

```typescript
import { ProcessBuilder, ProcessFinalizedError } from "@camcima/finita";

const builder = new ProcessBuilder("workflow")
  .addState("start", { initial: true })
  .addState("end")
  .addTransition("start", "end", { event: "finish" });

const process = builder.build(); // OK

try {
  builder.build(); // Throws — builder already finalized
} catch (error) {
  if (error instanceof ProcessFinalizedError) {
    console.log(`Builder for "${error.processName}" was already used`);
  }
}
```

---

## GraphValidationError

**Import:** `import { GraphValidationError } from '@camcima/finita'`

Thrown by `ProcessBuilder.build()` when the declared graph has a structural problem. The `code` property identifies the specific violation.

### Properties

| Property  | Type                      | Description                                            |
| --------- | ------------------------- | ------------------------------------------------------ |
| `code`    | `GraphValidationCode`     | A machine-readable code identifying the violation type |
| `details` | `Record<string, unknown>` | Additional context (state names, etc.)                 |
| `message` | `string`                  | Human-readable description including the code          |
| `name`    | `string`                  | `'GraphValidationError'`                               |

### `GraphValidationCode` values

| Code                    | When                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `missingInitialState`   | No state was declared with `{ initial: true }`                 |
| `multipleInitialStates` | More than one state declared with `{ initial: true }`          |
| `unknownTarget`         | A transition's `toState` name was never passed to `addState`   |
| `unknownSource`         | A transition's `fromState` name was never passed to `addState` |
| `emptyEventName`        | `addTransition` was called with an empty/whitespace event name |
| `orphanState`           | Unreachable state found (only when `strictOrphans: true`)      |

### Example

```typescript
import { ProcessBuilder, GraphValidationError } from "@camcima/finita";

try {
  new ProcessBuilder("bad")
    .addState("start", { initial: true })
    .addTransition("start", "nonexistent", { event: "go" }) // unknown target
    .build();
} catch (error) {
  if (error instanceof GraphValidationError) {
    console.log(error.code); // 'unknownTarget'
    console.log(error.details); // { fromState: 'start', toState: 'nonexistent', eventName: 'go' }
  }
}
```

---

## DuplicateTransitionError

**Import:** `import { DuplicateTransitionError } from '@camcima/finita'`

Thrown by `ProcessBuilder.build()` when two `addTransition` calls describe the same `(fromState, event, toState)` triple but reference different condition objects with different names. Same-identity duplicates (same condition name) are silently deduplicated; conflicting duplicates (different condition names, same endpoint triple) are an error.

### Properties

| Property   | Type                          | Description                                    |
| ---------- | ----------------------------- | ---------------------------------------------- |
| `conflict` | `DuplicateTransitionConflict` | Object describing the conflicting declarations |
| `message`  | `string`                      | Human-readable description of the conflict     |
| `name`     | `string`                      | `'DuplicateTransitionError'`                   |

### `DuplicateTransitionConflict` shape

```typescript
interface DuplicateTransitionConflict {
  fromState: string;
  toState: string;
  eventName: string | null;
  existingConditionName: string | null;
  newConditionName: string | null;
}
```

### Example

```typescript
import {
  ProcessBuilder,
  DuplicateTransitionError,
  CallbackCondition,
} from "@camcima/finita";

const c1 = new CallbackCondition("conditionA", () => true);
const c2 = new CallbackCondition("conditionB", () => false);

try {
  new ProcessBuilder("conflict")
    .addState("draft", { initial: true })
    .addState("submitted")
    .addTransition("draft", "submitted", { event: "submit", condition: c1 })
    .addTransition("draft", "submitted", { event: "submit", condition: c2 }) // conflict!
    .build();
} catch (error) {
  if (error instanceof DuplicateTransitionError) {
    console.log(error.conflict.fromState); // 'draft'
    console.log(error.conflict.existingConditionName); // 'conditionA'
    console.log(error.conflict.newConditionName); // 'conditionB'
  }
}
```

---

## Automatic Transition Cycle Error

Thrown when automatic transitions (no event name) form a cycle. This includes self-transitions (s1 → s1) and multi-state cycles (s1 → s2 → s1, s1 → s2 → s3 → s1, etc.). Without detection, these would cause infinite recursion since conditions would be re-evaluated immediately and the loop would never terminate.

### Message

```
Automatic transition cycle detected: state "{stateName}" was already visited — this would cause infinite recursion
```

This error is wrapped by the state machine's transition error handler, so the outer error message will be:

```
Exception was thrown when doing a transition from current state "{stateName}"
```

with the cycle error available via `error.cause` (possibly nested multiple levels for multi-state cycles).

### When It's Thrown

When `checkTransitions()` or `triggerEvent()` follows a chain of automatic transitions and encounters a state that was already visited in the current chain.

### How to Fix

Break the cycle by using event-based transitions for at least one edge:

```typescript
import { ProcessBuilder, CallbackCondition } from "@camcima/finita";

const condition = new CallbackCondition("check", (s) => (s as any).ready);

// BAD: automatic cycle — will throw at runtime
const bad = new ProcessBuilder("bad")
  .addState("s1", { initial: true })
  .addState("s2")
  .addTransition("s1", "s2", { condition })
  .addTransition("s2", "s1", { condition }) // cycle!
  .build();

// GOOD: use an event to break the cycle
const good = new ProcessBuilder("good")
  .addState("s1", { initial: true })
  .addState("s2")
  .addTransition("s1", "s2", { condition })
  .addTransition("s2", "s1", { event: "retry", condition })
  .build();
```
