# Transition Selectors

When multiple transitions are active simultaneously, a transition selector determines which one to take. All selectors implement `TransitionSelectorInterface`:

```typescript
interface TransitionSelectorInterface {
  selectTransition(
    transitions: Iterable<TransitionInterface>,
  ): TransitionInterface | null;
}
```

Selectors receive the **already-filtered** list of active transitions and return a single winner (or `null` if no transitions are available).

## Table of Contents

- [OneOrNoneActiveTransition](#oneornoneactivetransition)
- [ScoreTransition](#scoretransition)
- [WeightTransition](#weighttransition)
- [Selector Chaining](#selector-chaining)
- [Custom Selectors](#custom-selectors)

---

## OneOrNoneActiveTransition

**Import:** `import { OneOrNoneActiveTransition } from '@camcima/finita'`

The simplest selector. Expects zero or one active transition. Throws if more than one is active.

### What It Does

- **0 transitions:** returns `null`
- **1 transition:** returns it
- **2+ transitions:** throws `Error('More than one transition is active!')`

This is the **default selector** used by `Statemachine` when no selector is specified.

### Constructor

```typescript
new OneOrNoneActiveTransition();
```

### When to Use

- Your state machine is designed so that at most one transition is active at any time
- You want strict validation that your workflow is unambiguous
- You want errors early if your workflow definition has overlapping transitions

### Example

```typescript
import { ProcessBuilder, Statemachine } from "@camcima/finita";

const process = new ProcessBuilder("example")
  .addState("initial", { initial: true })
  .addState("done")
  .addTransition("initial", "done", { event: "finish" })
  .build();

// Default -- uses OneOrNoneActiveTransition
const sm = new Statemachine(subject, process);
```

---

## ScoreTransition

**Import:** `import { ScoreTransition } from '@camcima/finita'`

Selects the transition with the highest "specificity score". Prefers transitions that have more criteria (event name, condition) over bare transitions.

### What It Does

Calculates a score for each transition:

- Has an event name: **+2 points**
- Has a condition: **+1 point**

Selects the transition(s) with the highest score. If there's still a tie, delegates to the inner selector (default: `OneOrNoneActiveTransition`).

### Score Table

| Transition Type       | Event | Condition | Score |
| --------------------- | ----- | --------- | ----- |
| Bare automatic        | -     | -         | 0     |
| Conditional automatic | -     | yes       | 1     |
| Event-based           | yes   | -         | 2     |
| Conditional event     | yes   | yes       | 3     |

### Constructor

```typescript
new ScoreTransition(innerSelector?: TransitionSelectorInterface)
```

| Parameter       | Type                          | Default                           | Description                |
| --------------- | ----------------------------- | --------------------------------- | -------------------------- |
| `innerSelector` | `TransitionSelectorInterface` | `new OneOrNoneActiveTransition()` | Fallback selector for ties |

### When to Use

- You have states with both automatic and event-based transitions
- You want event-based transitions to take priority over automatic ones
- You want conditional transitions to take priority over unconditional ones

### Example

```typescript
import {
  ProcessBuilder,
  ScoreTransition,
  Statemachine,
  Tautology,
} from "@camcima/finita";

const process = new ProcessBuilder("sub")
  .addState("active", { initial: true })
  .addState("renewed")
  .addState("upgraded")
  // Event + condition (score 3): event AND condition required
  .addTransition("active", "upgraded", {
    event: "renew",
    condition: new Tautology("hasUpgradeCredit"),
  })
  // Event only (score 2): event-only transition
  .addTransition("active", "renewed", { event: "renew" })
  .build();

const sm = new Statemachine(subject, process, {
  transitionSelector: new ScoreTransition(),
});

// When 'renew' is triggered, both transitions are active. ScoreTransition
// prefers the event+condition transition (score 3) over the event-only one
// (score 2), so the subject moves from "active" to "upgraded".
sm.triggerEvent("renew");
```

### Phase separation: events vs automatic transitions

`ScoreTransition` (and every other selector) only sees transitions that are
active for the current evaluation phase. v3 has two separate phases:

- **Event phase** — `triggerEvent("foo")` evaluates only transitions whose
  `event` matches `"foo"`. Automatic transitions (those declared without an
  `event:` option) are not in the active set.
- **Automatic phase** — `checkTransitions()` evaluates only transitions
  whose `event` is `null`. Event-bound transitions are not in the active set.

Mixing the two — e.g., expecting an automatic transition to outrank an event
transition during a `triggerEvent` call — is not how the runtime resolves
transitions. Score selectors compare like with like.

---

## WeightTransition

**Import:** `import { WeightTransition } from '@camcima/finita'`

Selects the transition with the highest weight. Transitions have a default weight of `1`, set at construction time via `ProcessBuilder.addTransition({ weight })`.

### What It Does

Finds the transition(s) with the highest weight. Uses an epsilon tolerance (default: `0.001`) for floating-point comparison. If there's a tie, delegates to the inner selector.

### Constructor

```typescript
new WeightTransition(innerSelector?: TransitionSelectorInterface, epsilon?: number)
```

| Parameter       | Type                          | Default                           | Description                                    |
| --------------- | ----------------------------- | --------------------------------- | ---------------------------------------------- |
| `innerSelector` | `TransitionSelectorInterface` | `new OneOrNoneActiveTransition()` | Fallback for ties                              |
| `epsilon`       | `number`                      | `0.001`                           | Tolerance for floating-point weight comparison |

### When to Use

- You have multiple transitions from the same state for the same event
- You want to assign explicit priority to certain transitions
- You need fine-grained control over transition selection

### Example

```typescript
import {
  ProcessBuilder,
  WeightTransition,
  Statemachine,
  CallbackCondition,
} from "@camcima/finita";

const isVip = new CallbackCondition("isVip", (s) => (s as any).vip);
const isNotVip = new CallbackCondition("isNotVip", (s) => !(s as any).vip);

const process = new ProcessBuilder("approval")
  .addState("pending", { initial: true })
  .addState("vip-approved")
  .addState("standard-approved")
  .addTransition("pending", "vip-approved", {
    event: "approve",
    condition: isVip,
    weight: 10,
  })
  .addTransition("pending", "standard-approved", {
    event: "approve",
    condition: isNotVip,
    weight: 1,
  })
  .build();

const sm = new Statemachine(subject, process, {
  transitionSelector: new WeightTransition(),
});
```

---

## Selector Chaining

Selectors can be nested. The outer selector filters first, then delegates ties to the inner selector:

```mermaid
flowchart LR
    A[Active transitions] --> B[ScoreTransition]
    B -->|Highest score wins| C{Tie?}
    C -- No --> D[Selected]
    C -- Yes --> E[WeightTransition]
    E -->|Highest weight wins| F{Tie?}
    F -- No --> D
    F -- Yes --> G[OneOrNoneActiveTransition]
    G -->|Must be exactly 1| D
```

```typescript
import {
  ProcessBuilder,
  ScoreTransition,
  Statemachine,
  WeightTransition,
} from "@camcima/finita";

// First select by score, then break ties by weight
const selector = new ScoreTransition(new WeightTransition());

const sm = new Statemachine(subject, process, { transitionSelector: selector });
```

---

## Custom Selectors

Implement `TransitionSelectorInterface` for custom selection logic:

```typescript
import type {
  TransitionSelectorInterface,
  TransitionInterface,
} from "@camcima/finita";

class RandomTransition implements TransitionSelectorInterface {
  selectTransition(
    transitions: Iterable<TransitionInterface>,
  ): TransitionInterface | null {
    const arr = Array.from(transitions);
    if (arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
```
