# Errors

Custom error classes thrown by the state machine.

## Table of Contents

- [WrongEventForStateError](#wrongeventforstateerror)
- [LockCanNotBeAcquiredError](#lockcannotbeacquirederror)
- [DuplicateStateError](#duplicatestateerror)
- [Automatic Transition Cycle Error](#automatic-transition-cycle-error)

---

## WrongEventForStateError

**Import:** `import { WrongEventForStateError } from 'finita'`

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
import { WrongEventForStateError } from "finita";

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

**Import:** `import { LockCanNotBeAcquiredError } from 'finita'`

Thrown when the state machine cannot acquire its lock before processing an event or checking transitions.

### Properties

| Property  | Type     | Description                   |
| --------- | -------- | ----------------------------- |
| `message` | `string` | `'Lock can not be acquired!'` |

### Example

```typescript
import { LockCanNotBeAcquiredError } from "finita";

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

**Import:** `import { DuplicateStateError } from 'finita'`

Thrown when a `StateCollection` or `Process` constructor encounters a different state instance with the same name. Since `Process` is immutable after construction, this error occurs during the constructor's automatic graph discovery when two distinct state objects share a name.

### Properties

| Property    | Type     | Description                                                                       |
| ----------- | -------- | --------------------------------------------------------------------------------- |
| `stateName` | `string` | The duplicate state name                                                          |
| `message`   | `string` | `'There is already a different state with name "{stateName}" in this collection'` |
| `name`      | `string` | `'DuplicateStateError'`                                                           |

### Example

```typescript
import { DuplicateStateError, State, StateCollection } from "finita";

const collection = new StateCollection();
collection.addState(new State("open"));

try {
  collection.addState(new State("open")); // Different instance, same name
} catch (error) {
  if (error instanceof DuplicateStateError) {
    console.log(`Duplicate state: "${error.stateName}"`);
  }
}
```

### When It's Thrown

- `StateCollection.addState()` is called with a state whose name matches an existing state (different instance)
- `Process` constructor discovers two different state instances with the same name while walking transitions
- Re-adding the **same instance** is allowed (idempotent)

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
// BAD: automatic cycle — will throw
s1.addTransition(new Transition(s2, null, condition));
s2.addTransition(new Transition(s1, null, condition));

// GOOD: use an event to break the cycle
s1.addTransition(new Transition(s2, null, condition));
s2.addTransition(new Transition(s1, "retry", condition));
```
