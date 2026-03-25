# Filters

Filters are static functions that produce subsets of states or transitions based on specific criteria. Most filters are sync generators (`function*`) that return `Iterable<T>`, making them lazy and composable. The exception is `ActiveTransitionFilter`, which is an async method returning `Promise<TransitionInterface[]>` because transition conditions may be asynchronous.

All filters follow the same pattern: a static `filter()` method that takes an iterable and returns matching items.

## Table of Contents

- [ActiveTransitionFilter](#activetransitionfilter)
- [FilterStateByEvent](#filterstatebyevent)
- [FilterStateByTransition](#filterstatebytransition)
- [FilterStateByFinalState](#filterstatebyfinalstate)
- [FilterTransitionByEvent](#filtertransitionbyevent)

---

## ActiveTransitionFilter

**Import:** `import { ActiveTransitionFilter } from '@camcima/finita'`

Filters transitions to only those that are currently active. This is the core filter used internally by the state machine during transition processing.

### What It Does

Iterates over transitions and collects only those where `transition.isActive(subject, context, event)` returns `true` into an array. A transition is active when its event matches (or it's an automatic transition with no event) **and** its condition (if any) passes. Because conditions may be asynchronous, this filter returns a `Promise<TransitionInterface[]>` rather than using a generator.

### Signature

```typescript
static async filter(
  transitions: Iterable<TransitionInterface>,
  subject: unknown,
  context: Map<string, unknown>,
  event?: EventInterface
): Promise<TransitionInterface[]>
```

| Parameter     | Type                            | Description                                           |
| ------------- | ------------------------------- | ----------------------------------------------------- |
| `transitions` | `Iterable<TransitionInterface>` | The transitions to filter                             |
| `subject`     | `unknown`                       | The domain object                                     |
| `context`     | `Map<string, unknown>`          | The current context                                   |
| `event`       | `EventInterface` (optional)     | The triggering event. Omit for automatic transitions. |

### Example

```typescript
import { ActiveTransitionFilter, Event } from "@camcima/finita";

const event = new Event("approve");
const activeTransitions = await ActiveTransitionFilter.filter(
  state.getTransitions(),
  subject,
  new Map(),
  event,
);
```

---

## FilterStateByEvent

**Import:** `import { FilterStateByEvent } from '@camcima/finita'`

Filters states that have a specific event registered.

### What It Does

Yields only states where `state.hasEvent(eventName)` is `true`.

### Signature

```typescript
static *filter(
  states: Iterable<StateInterface>,
  eventName: string
): Iterable<StateInterface>
```

### When to Use

- Finding all states that respond to a particular event
- Building UI that shows which states accept a given action
- Analyzing the workflow graph

### Example

```typescript
import { FilterStateByEvent } from "@camcima/finita";

// Find all states that accept the 'approve' event
const approvableStates = Array.from(
  FilterStateByEvent.filter(process.getStates(), "approve"),
);

for (const state of approvableStates) {
  console.log(`${state.getName()} accepts 'approve'`);
}
```

---

## FilterStateByTransition

**Import:** `import { FilterStateByTransition } from '@camcima/finita'`

Filters states that have at least one automatic transition (a transition without an event name).

### What It Does

Yields states that have at least one transition where `transition.getEventName()` is `null`. These are states that can automatically advance to another state when a condition is met.

### Signature

```typescript
static *filter(
  states: Iterable<StateInterface>
): Iterable<StateInterface>
```

### When to Use

- Identifying states with automatic (condition-based) transitions
- Finding states that may change without user interaction
- Workflow analysis and visualization

### Example

```typescript
import { FilterStateByTransition } from "@camcima/finita";

// Find states with automatic transitions
const autoStates = Array.from(
  FilterStateByTransition.filter(process.getStates()),
);

for (const state of autoStates) {
  console.log(`${state.getName()} has automatic transitions`);
}
```

---

## FilterStateByFinalState

**Import:** `import { FilterStateByFinalState } from '@camcima/finita'`

Filters states that have no outgoing transitions. These are terminal (final) states in the workflow.

### What It Does

Yields states that have zero outgoing transitions. A state with no transitions is a dead end -- the workflow cannot proceed further from this state.

### Signature

```typescript
static *filter(
  states: Iterable<StateInterface>
): Iterable<StateInterface>
```

### When to Use

- Identifying terminal states in a workflow
- Validating that a workflow has proper end states
- Building workflow visualization with distinct final state styling

### Example

```typescript
import { FilterStateByFinalState } from "@camcima/finita";

// Find all terminal states
const finalStates = Array.from(
  FilterStateByFinalState.filter(process.getStates()),
);

for (const state of finalStates) {
  console.log(`${state.getName()} is a final state`);
}
// e.g., "completed is a final state", "cancelled is a final state"
```

---

## FilterTransitionByEvent

**Import:** `import { FilterTransitionByEvent } from '@camcima/finita'`

Filters transitions that match a specific event name.

### What It Does

Yields transitions where `transition.getEventName() === eventName`.

### Signature

```typescript
static *filter(
  transitions: Iterable<TransitionInterface>,
  eventName: string
): Iterable<TransitionInterface>
```

### When to Use

- Finding all transitions triggered by a specific event
- Analyzing which states a given event can lead to
- Building event-specific workflow reports

### Example

```typescript
import { FilterTransitionByEvent } from "@camcima/finita";

// Find all transitions triggered by 'approve'
for (const state of process.getStates()) {
  const approveTransitions = Array.from(
    FilterTransitionByEvent.filter(state.getTransitions(), "approve"),
  );
  for (const t of approveTransitions) {
    console.log(
      `${state.getName()} --approve--> ${t.getTargetState().getName()}`,
    );
  }
}
```

---

## Composing Filters

Since all filters return iterables, they can be chained:

```typescript
import { FilterStateByEvent, FilterStateByTransition } from "@camcima/finita";

// States that have the 'process' event AND have automatic transitions
const eventStates = FilterStateByEvent.filter(process.getStates(), "process");
const autoAndEventStates = Array.from(
  FilterStateByTransition.filter(eventStates),
);
```
