# Code Review — finita v3.0.1

**Date:** 2026-06-11
**Scope:** Full `src/` tree (~2,700 lines) at commit `1de5a32`
**Method:** 7 independent finder passes (3 correctness angles, reuse, simplification, efficiency, altitude) followed by one adversarial verifier per candidate. Several findings were reproduced empirically against `dist/`. Verdicts: CONFIRMED (constructible/reproduced), PLAUSIBLE (realistic but state-dependent), REFUTED (dropped).

## Summary

The library is in good shape overall — the builder validation, error hierarchy, and operation-queue design are solid, and two suspected bugs turned out to be intentional, tested behavior (event-driven self-transitions; the `Dispatcher` ready-flag flaw is unreachable). Verification confirmed **10 ranked correctness findings**, the worst being shared mutable state on `Event` objects that races across machines built from the same `Process`, and a `Factory` + `StatefulStatusChanger` combination — demonstrated in the project's own quick-start docs — that silently corrupts the wrong subject's persisted state.

**Highest-leverage fixes, in order:** #1 (pass args through notification), #2 (put the subject on the frame), #7 (one-line `runIfIdle`), #10 (`!== undefined` plus state-name validation), #6 (reorder resolve/release). #6, #7, #9, #10 are small and mechanical; #1 and #2 touch public interfaces and warrant a deliberate API decision.

---

## Correctness findings (ranked by severity)

### 1. `src/Event.ts:22` — `invokeArgs` is shared mutable state across all machines built from one Process — CONFIRMED

`Event` instances live on the `State`/`Process` graph, and neither `Factory` nor `Statemachine` clones the process (`this.process = process`). `invoke()` writes `this.invokeArgs = args`, awaits observers, then resets in `finally`. Two machines (standard Factory pattern, default `NullMutex` — per-machine queues don't serialize across machines) triggering concurrently interleave at every `await observer.update(this)`.

**Failure scenario:** Machine A's `CallbackObserver` reads machine B's `[subject, context]` (side effects applied to the wrong subject), or reads `[]` after B's `finally` resets the field.

**Fix:** Pass args through the notification call (`observer.update(subject, args)`) instead of the temporal instance field. This also eliminates the duck-typing in `CallbackObserver.ts:21` and the `try/finally` reset.

### 2. `src/observer/StatefulStatusChanger.ts:15` + `src/factory/Factory.ts:72` — factory-attached status changer writes every machine's state to one subject — CONFIRMED

The observer is bound to a single subject at construction, but `TransitionFrame` carries no subject reference (only `machineName`, which is just the process name), and `Factory.createStatemachine` attaches every stored observer to every machine.

**Failure scenario:** `factory.attachAfterObserver(new StatefulStatusChanger(order1))` makes order2's transitions overwrite order1's persisted state while order2 never persists. **`docs/factory.md:92-97` demonstrates exactly this corrupting pattern** in the quick-start, while `docs/factory.md:323-336` warns against it.

**Fix:** Add the subject to the frame (the deep fix), and correct the doc example.

### 3. `src/observer/OnEnterObserver.ts:28` — enqueued `onEnter` resolves against the wrong state — CONFIRMED

The enqueued event is resolved against whatever state is current when the queue drains, not `frame.toState`.

**Failure scenario:** A→B (B declares `onEnter`) followed by an automatic B→C in the same operation: if C lacks `onEnter`, the `WrongEventForStateError` is swallowed by the chained op's no-op `reject` and B's hook is silently lost; if C declares it, C's hook fires twice.

### 4. `src/Statemachine.ts:162` — re-entrant `await sm.triggerEvent()` inside an observer deadlocks permanently and silently — CONFIRMED (reproduced)

The runner blocks awaiting the observer; the observer awaits a promise only the runner can resolve; `runIfIdle` bails on `if (this.running) return`. Every subsequent trigger on that machine hangs too. The interface doc comment forbids it and `EnqueueContext` is the sanctioned alternative, but a silent permanent hang is hostile.

**Fix:** Detect re-entrancy (e.g. an `AsyncLocalStorage` flag or a "currently draining" check on the calling context) and throw a `ReentrancyError` instead.

### 5. `src/Statemachine.ts:257` — automatic-transition cycle detector rejects legitimate terminating loops, after partial commit — CONFIRMED

The visited-`Set` fires on the _first_ revisit regardless of conditions, so a condition-terminated retry loop (check→work→check→done) always throws `AutomaticTransitionCycleError` — even though `docs/errors.md` says the error means "the graph would loop forever." Worse, the throw happens after earlier hops already committed (`currentState`/`lastState` mutated, after-observers/persistence ran) with no rollback, stranding the machine mid-loop.

**Fix:** Consider a max-iterations bound instead of a visited set, and document the partial-commit semantics.

### 6. `src/Statemachine.ts:193` — `op.resolve()` runs before `await mutex.releaseLock()` — CONFIRMED (reproduced)

With an async `LockAdapterMutex`: after `await sm.triggerEvent('e')`, `isLockAcquired()` returns `true`, and an immediate `sm.acquireLock()` hits the stale `if (!this.acquired)` guard and returns `true` without re-acquiring — then the in-flight release drops the underlying lock, so the caller holds nothing. With a Redis/DB advisory lock this is a real distributed-lock integrity hole. (No observable effect with the default synchronous `NullMutex`.)

**Fix:** Move `op.resolve()` after the `finally` completes.

### 7. `src/Statemachine.ts:300` — `EnqueueContext.enqueue` never calls `runIfIdle`, stranding late enqueues — CONFIRMED (reproduced)

An after-observer doing `setTimeout(() => ctx.enqueue('next'), 10)` leaves the op in the queue indefinitely (its resolve/reject are no-ops, so the loss is silent) until an unrelated trigger arrives. This contradicts the documented contract in `AfterTransitionObserverInterface.ts:8-10` ("runs as its own top-level operation after the current operation completes").

**Fix:** One line — add `void this.runIfIdle()` to the closure.

### 8. `src/ProcessBuilder.ts:207` — duplicate-transition validation ignores weight; the conflicting spec is silently dropped — CONFIRMED

Both the conflict key and the dedup key are `from\x00event\x00to` + condition only. `addTransition('a','b',{event:'go',weight:1})` then `...{weight:10}` passes validation and the weight-10 spec is silently discarded (first wins), so a `WeightTransition` selector resolves on the stale weight.

**Fix:** Include weight in the conflict check (or throw on any same-key redeclaration).

### 9. `src/selector/WeightTransition.ts:31` — epsilon tie branch never updates `bestWeight`, making selection order-dependent — CONFIRMED

Hand-traced: weights `[1.0, 1.0009, 1.0018]` with the default epsilon 0.001 yield a sole winner (1.0018) in ascending declaration order but a two-element tie → `AmbiguousTransitionError` in descending order. Same weight multiset, opposite outcomes. (`ScoreTransition` is unaffected — exact integer equality.)

**Fix:** Track the true max first (or update the anchor on tie), then collect everything within epsilon of the max in a second pass.

### 10. `src/Statemachine.ts:54` — empty-string `initialStateName` silently discarded by a truthiness check — PLAUSIBLE

The whole chain is constructible: `addState("")` builds (state names are never validated, unlike event/condition names), `StatefulStateNameDetector` returns the subject's `''` verbatim, `Factory.ts:66` forwards it through `?? undefined`, and the constructor's `options.initialStateName ? ... : getInitialState()` silently restarts the workflow from the initial state instead of throwing `StateNotFoundError`. For a persistence-oriented FSM, silently replaying a workflow on a corrupted subject is the worst failure mode.

**Fix:** Use `!== undefined` and validate state names in `addState` like events already are.

---

## Confirmed but below the top-10 cut

- **`src/Statemachine.ts:278` / `:316`** — observer notification loops iterate the live arrays that `detachBefore`/`detachAfter` splice in place; an observer that detaches itself during its own `notify` causes the next observer to be skipped for that transition. Iterate a snapshot (`[...this.beforeObservers]`). — CONFIRMED
- **`src/graph/GraphBuilder.ts:33`** — `escapeDoubleQuotes` escapes `"` but not backslashes, so a name ending in `\` produces unterminated-string DOT output that Graphviz cannot parse; the mermaid escaper (line 47) has the analogous gap. — CONFIRMED
- **`src/graph/GraphBuilder.ts:89`** — `getTransitionLabel` calls `state.getEvent()` without the `hasEvent` guard its sibling at line 117 uses; only reachable via custom `StateInterface` implementations, which the public API accepts. — PLAUSIBLE

## Investigated and cleared

- **Event-driven self-transitions** are intentional: event-attached observers fire, machine-level observers are gated on state change, pinned by `tests/core.test.ts:351` and `tests/exception-cleanup.test.ts:301`. — REFUTED
- **`Dispatcher` ready-flag on the error path** is real in isolation but unreachable: single command, never retried, class not publicly exported. — REFUTED

---

## Cleanup (all verified against the source)

- **`src/Statemachine.ts:287`** — `committedFrame` duplicates `proposedFrame` field-for-field, including a second `readonlyContext(context)` Map copy per transition. Pass `proposedFrame` to after-observers (`ProposedTransitionFrame` is already an empty interface extending `TransitionFrame`, complete with an eslint-disable that a type alias would remove).
- **`src/Statemachine.ts:133-157, 299-313`** — `triggerEvent`, `checkTransitions`, and the `enqueueCtx` closure hand-build the same `QueuedOperation` shape three times, and `kind` is fully derivable from `eventName` nullability. One private `enqueueOperation(eventName: string | null, context?)` helper removes all three copies — and would have prevented finding #7.
- **`src/ProcessBuilder.ts:207/298`** — the `\x00`-joined identity key is built independently in validation and dedup, and the 14-line `idForCondition` machinery in `buildAllStates` is provably redundant once validation has passed (same-key specs are guaranteed same-condition). Dedup once in validation and iterate the clean list.
- **`src/condition/AndComposite.ts` / `OrComposite.ts`** — 33-line mirror files differing only in join word, add-method name, and short-circuit polarity; a shared composite base removes the drift risk.
- **`src/observer/TransitionLogger.ts:6-18`** — `isNamed`/`asString` are byte-for-byte copies of `GraphBuilder.ts:24-56`'s `isNamed`/`convertToString`; `src/util/index.ts` exists as an empty placeholder waiting for exactly this.
- **Name validation has drifted** — event names reject whitespace-padding, condition names don't, state names aren't validated at all; unify into one `assertValidName` applied to every named entity.
- **`src/filter/ActiveTransitionFilter.ts`** — hardcoded static call in the transition loop while its sibling `transitionSelector` is injectable via `StatemachineOptions`; inject the filter the same way (or unify filter+selector into one strategy).
- **`src/condition/Timeout.ts:36`** — throws a plain `Error` instead of `InvalidSubjectError` for the same subject-shape check `StatefulStateNameDetector` uses.
- **`src/condition/Timeout.ts:40`** — allocates two `Date` objects per evaluation; `getTime() + timeoutMs <= Date.now()` suffices on the polling hot path.
- **`src/internal/Dispatcher.ts`** — a command-buffer abstraction used exactly once to invoke a single event; inlining `await event.invoke(this.subject, context)` deletes the class, its interface exports, and a per-trigger allocation.
- **Design note (`src/observer/OnEnterObserver.ts`)** — on-enter behavior is a magic event-name convention layered on transition events: sentinel `onEnter` edges pollute graph exports and collide with real events of that name. First-class per-state entry hooks (registered at build time, consumed by a generic after-observer keyed on `frame.toState`) would be the deeper mechanism — and would also resolve finding #3.

---

## Machine-readable findings

```json
[
  {
    "file": "src/Event.ts",
    "line": 22,
    "summary": "invokeArgs is shared mutable state on Event objects shared across all machines built from one Process; concurrent invokes race",
    "failure_scenario": "Two machines from one Factory trigger concurrently; machine A's observers read machine B's [subject, context] (side effects on wrong subject) or [] after B's finally reset"
  },
  {
    "file": "src/observer/StatefulStatusChanger.ts",
    "line": 15,
    "summary": "Factory-attached StatefulStatusChanger writes every machine's transitions to its single constructor-bound subject; frame carries no subject so the pattern can't work",
    "failure_scenario": "docs/factory.md:92 pattern: attachAfterObserver(new StatefulStatusChanger(order1)) + createStatemachine(order2) → order2's transitions overwrite order1's persisted state; order2 never persists"
  },
  {
    "file": "src/observer/OnEnterObserver.ts",
    "line": 28,
    "summary": "Enqueued onEnter resolves against the state current at drain time, not frame.toState",
    "failure_scenario": "A→B (onEnter) then automatic B→C in one operation: C lacks onEnter → WrongEventForStateError swallowed by no-op reject, hook silently lost; C has onEnter → fires twice"
  },
  {
    "file": "src/Statemachine.ts",
    "line": 162,
    "summary": "await triggerEvent()/checkTransitions() from inside an observer/condition deadlocks the machine permanently with no re-entrancy detection",
    "failure_scenario": "Observer awaits sm.triggerEvent('next'); runner blocked awaiting observer, promise resolvable only by runner; reproduced — machine and all future triggers hang silently forever"
  },
  {
    "file": "src/Statemachine.ts",
    "line": 257,
    "summary": "Automatic-transition cycle detector throws on first state revisit, rejecting condition-terminated loops, after intermediate hops were committed and persisted",
    "failure_scenario": "check→work→check retry loop with decrementing counter: AutomaticTransitionCycleError on first revisit; currentState/lastState and after-observer persistence from committed hops remain, machine stranded mid-loop"
  },
  {
    "file": "src/Statemachine.ts",
    "line": 193,
    "summary": "op.resolve() runs before finally awaits mutex.releaseLock(), so the caller resumes while an async lock release is in flight",
    "failure_scenario": "Reproduced with async LockAdapterMutex: after await triggerEvent, isLockAcquired()===true and an immediate acquireLock() returns true without re-acquiring; in-flight release then drops the lock the caller believes it holds"
  },
  {
    "file": "src/Statemachine.ts",
    "line": 300,
    "summary": "EnqueueContext.enqueue pushes to the queue without runIfIdle, stranding any enqueue made after the current drain exits",
    "failure_scenario": "Reproduced: after-observer calls ctx.enqueue('next') in a setTimeout → op sits in queue silently (no-op resolve/reject) until an unrelated trigger; contradicts AfterTransitionObserverInterface's documented contract"
  },
  {
    "file": "src/ProcessBuilder.ts",
    "line": 207,
    "summary": "Duplicate-transition conflict check and dedup key both ignore weight, so a re-declared transition with a different weight is silently dropped (first wins)",
    "failure_scenario": "addTransition('a','b',{event:'go',weight:1}) then {...weight:10} → passes validation, weight-10 spec discarded; WeightTransition selector resolves on weight 1"
  },
  {
    "file": "src/selector/WeightTransition.ts",
    "line": 31,
    "summary": "Epsilon tie branch never updates bestWeight, so selection depends on transition declaration order",
    "failure_scenario": "Weights [1.0, 1.0009, 1.0018], epsilon 0.001: ascending order → sole winner 1.0018; descending → two-element tie → AmbiguousTransitionError from default inner selector. Same weights, opposite outcomes"
  },
  {
    "file": "src/Statemachine.ts",
    "line": 54,
    "summary": "Truthiness check silently discards an empty-string initialStateName; state names are never validated in the builder and the Factory forwards '' via ?? undefined",
    "failure_scenario": "Subject persisted with state '' restored via Factory/StatefulStateNameDetector → machine silently restarts at the process initial state and replays transitions/side effects instead of throwing StateNotFoundError"
  }
]
```
