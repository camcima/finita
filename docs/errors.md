# Errors

Custom error classes thrown by the state machine.

## Table of Contents

- [FinitaError](#finitaerror)
- [WrongEventForStateError](#wrongeventforstateerror)
- [LockCanNotBeAcquiredError](#lockcannotbeacquirederror)
- [DuplicateStateError](#duplicatestateerror)
- [ProcessFinalizedError](#processfinalizederror)
- [GraphValidationError](#graphvalidationerror)
- [DuplicateTransitionError](#duplicatetransitionerror)
- [StateNotFoundError](#statenotfounderror)
- [StateEventNotFoundError](#stateeventnotfounderror)
- [ProcessNotFoundError](#processnotfounderror)
- [InvalidSubjectError](#invalidsubjecterror)
- [AmbiguousTransitionError](#ambiguoustransitionerror)
- [AutomaticTransitionCycleError](#automatictransitioncycleerror)

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

| Code                    | When                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `missingInitialState`   | No state was declared with `{ initial: true }`                                             |
| `multipleInitialStates` | More than one state declared with `{ initial: true }`                                      |
| `unknownTarget`         | A transition's `toState` name was never passed to `addState`                               |
| `unknownSource`         | A transition's `fromState` name was never passed to `addState`                             |
| `invalidEventName`      | `addTransition` was called with an empty, whitespace-only, or whitespace-padded event name |
| `invalidConditionName`  | `addTransition` was called with a condition whose `getName()` returns empty/whitespace     |
| `orphanState`           | Unreachable state found (only when `strictOrphans: true`)                                  |

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

Thrown by `ProcessBuilder.build()` when two `addTransition` calls describe the same `(fromState, event, toState)` triple but reference **different condition object instances**, regardless of whether the conditions share a `getName()` value. Declaring the same transition twice with the **same condition reference** is silently deduplicated (idempotent re-declaration); declaring it with two different references is treated as conflicting logic, since the library cannot introspect callable bodies to compare them. See [Condition Identity for Deduplication](conditions.md#condition-identity-for-deduplication) for the rationale.

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

## FinitaError

**Import:** `import { FinitaError } from '@camcima/finita'`

Abstract base class for every error thrown by `@camcima/finita`. Every typed
error class in this document extends `FinitaError`. Use `instanceof FinitaError`
to catch any library-thrown error in one branch.

### Properties

| Property  | Type     | Description                                                    |
| --------- | -------- | -------------------------------------------------------------- |
| `code`    | `string` | Discriminator unique to each subclass (e.g. `"stateNotFound"`) |
| `message` | `string` | Human-readable description                                     |
| `name`    | `string` | The subclass name                                              |

### Example

```typescript
import { FinitaError } from "@camcima/finita";

try {
  await statemachine.triggerEvent("go");
} catch (err) {
  if (err instanceof FinitaError) {
    switch (err.code) {
      case "wrongEventForState":
        /* ... */ break;
      case "automaticTransitionCycle":
        /* ... */ break;
      default: /* ... */
    }
  } else {
    throw err;
  }
}
```

---

## StateNotFoundError

**Import:** `import { StateNotFoundError } from '@camcima/finita'`

Thrown by `StateCollection.getState(name)` when no state with that name exists.

### Properties

| Property          | Type                | Description                              |
| ----------------- | ------------------- | ---------------------------------------- |
| `code`            | `"stateNotFound"`   | Discriminator                            |
| `stateName`       | `string`            | The name that was looked up              |
| `availableStates` | `readonly string[]` | Names that are present in the collection |
| `name`            | `string`            | `'StateNotFoundError'`                   |

---

## StateEventNotFoundError

**Import:** `import { StateEventNotFoundError } from '@camcima/finita'`

Thrown by `State.getEvent(name)` when the named event is not declared on the state.

### Properties

| Property    | Type                   | Description                       |
| ----------- | ---------------------- | --------------------------------- |
| `code`      | `"stateEventNotFound"` | Discriminator                     |
| `stateName` | `string`               | The state being queried           |
| `eventName` | `string`               | The event name that was looked up |
| `name`      | `string`               | `'StateEventNotFoundError'`       |

---

## ProcessNotFoundError

**Import:** `import { ProcessNotFoundError } from '@camcima/finita'`

Thrown by `AbstractNamedProcessDetector.detectProcess(subject)` when no process matches the detected name.

### Properties

| Property             | Type                | Description                                   |
| -------------------- | ------------------- | --------------------------------------------- |
| `code`               | `"processNotFound"` | Discriminator                                 |
| `processName`        | `string`            | The process name that was detected            |
| `availableProcesses` | `readonly string[]` | Names of processes registered on the detector |
| `name`               | `string`            | `'ProcessNotFoundError'`                      |

---

## InvalidSubjectError

**Import:** `import { InvalidSubjectError } from '@camcima/finita'`

Thrown by `StatefulStateNameDetector.detectCurrentStateName(subject)` (and any future detector with a structural subject contract) when the subject does not satisfy the expected interface.

### Properties

| Property            | Type                | Description                                         |
| ------------------- | ------------------- | --------------------------------------------------- |
| `code`              | `"invalidSubject"`  | Discriminator                                       |
| `expectedInterface` | `string`            | Name of the interface the subject failed to satisfy |
| `missingMembers`    | `readonly string[]` | Method/property names that were absent              |
| `name`              | `string`            | `'InvalidSubjectError'`                             |

---

## AmbiguousTransitionError

**Import:** `import { AmbiguousTransitionError } from '@camcima/finita'`

Thrown by `OneOrNoneActiveTransition.selectTransition(transitions)` when more than one transition is simultaneously active.

### Properties

| Property      | Type                    | Description                      |
| ------------- | ----------------------- | -------------------------------- |
| `code`        | `"ambiguousTransition"` | Discriminator                    |
| `activeCount` | `number`                | How many transitions were active |
| `name`        | `string`                | `'AmbiguousTransitionError'`     |

---

## AutomaticTransitionCycleError

**Import:** `import { AutomaticTransitionCycleError } from '@camcima/finita'`

Thrown by `Statemachine` when an automatic-transition cycle is detected during `triggerEvent` / `checkTransitions`. Indicates the graph would loop forever.

### Properties

| Property            | Type                         | Description                             |
| ------------------- | ---------------------------- | --------------------------------------- |
| `code`              | `"automaticTransitionCycle"` | Discriminator                           |
| `targetStateName`   | `string`                     | The state already visited in this run   |
| `visitedStateNames` | `readonly string[]`          | The states visited so far in this drive |
| `name`              | `string`                     | `'AutomaticTransitionCycleError'`       |
