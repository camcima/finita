# Architecture Review — finita v4.1.0

**Date:** 2026-08-18
**Scope:** Full `src/` tree (~3,000 lines, 90 files) at `main` (9932a58), plus docs, tests, packaging, and CI.
**Method:** Complete read of every source file by a single reviewer, cross-checked against the June 2026 review (`CODE_REVIEW.md`) and its remediation. Both confirmed bugs below were **reproduced empirically** with throwaway test files (since deleted). Baseline verified before review: `pnpm lint` clean, `pnpm test` 369/369 passing across 46 files.

---

## Executive summary

This is a mature, unusually well-hardened library for its size. The June v3.0.1 review's ten findings are **all fixed** in v4 (verified individually — see the table at the end), the graph model is genuinely immutable, the operation-queue engine is carefully reasoned about, and the test suite pins edge cases most libraries never think about.

This pass found **two confirmed bugs** — both in the newest code (the v4.1.0 lock-diagnostics and idle-await features), both reproduced:

1. A mutex `releaseLock()` that **returns `false`** (the documented failure signal of `LockAdapterInterface`) is silently ignored — producing exactly the silent stuck-lock scenario the v4.1.0 `onReleaseError` work was built to prevent.
2. `whenIdle()` is missing the re-entrancy guard that `triggerEvent`/`checkTransitions` received in v4 — awaiting it inside an observer deadlocks the machine permanently and silently.

Beyond those, the findings are API-consistency gaps (the `Factory` can't configure v4's engine options; `Event` is the one mutable back door in the frozen graph) and smaller cleanups. Nothing here threatens the core transition semantics.

---

## Confirmed bugs

### 1. `releaseLock()` returning `false` is silently swallowed → silent stuck lock — **High**

**Where:** `src/Statemachine.ts:292-310` (the release block in `runOperation`).

**Contract mismatch:** `MutexInterface.releaseLock()` returns `MaybePromise<boolean>`, and `false` means the release failed. `LockAdapterMutex.releaseLock()` (`src/mutex/LockAdapterMutex.ts:23-32`) returns the adapter's `false` and keeps `acquired = true`. The engine, however, handles only the _throwing_ release path:

```ts
await this.mutex.releaseLock(); // boolean result discarded
```

**Reproduced:** with a mutex whose release returns `false`:

- the operation **resolves successfully** — the caller learns nothing;
- `onReleaseError` never fires (it only sees exceptions);
- `isLockAcquired()` stays `true` forever;
- every subsequent operation sees `isAcquired() === true`, skips acquisition (`acquiredHere = false`), and therefore **never releases** — the exact "every later operation silently piggybacks on the stuck lock" scenario the inline comment at `src/Statemachine.ts:303-308` says must not happen.

This is not a contrived mutex: the project's own PostgreSQL advisory-lock example in `docs/mutex.md` returns `rows[0].released === true` — i.e. `false` on a failed unlock — and `tests/resolve-after-release.test.ts` pins only the throwing path.

**Recommendation:** treat `false` exactly like a thrown release error:

```ts
let released = false;
try {
  released = await this.mutex.releaseLock();
} catch (err) {
  /* existing handling */
}
if (!released && !failure) {
  /* synthesize error, call onReleaseError, set failure */
}
```

Add the `false`-return case to `resolve-after-release.test.ts`, and extend the "Release Error Behavior" section of `docs/mutex.md` (it currently only covers throws).

### 2. `whenIdle()` has no re-entrancy guard → silent permanent deadlock — **Medium-High**

**Where:** `src/Statemachine.ts:184-191`.

`triggerEvent` and `checkTransitions` call `assertNotReentrant(...)` so that a synchronous re-entrant call from an observer/condition throws `ReentrancyError` instead of deadlocking (the v4 fix for June finding #4). `whenIdle()` — added in the same release — did not get the guard, and calling it from inside a callback is _always_ a deadlock: the machine cannot become idle while the runner is awaiting that callback.

**Reproduced:** an after-observer that does `await sm.whenIdle()` hangs forever. The transition commits, the caller's `triggerEvent` promise never settles, no error is ever surfaced, and the runner stays blocked, so every future operation enqueues and never runs — the machine is permanently wedged.

**Recommendation:** add `this.assertNotReentrant("whenIdle()")` at the top of `whenIdle()` (before the fast-path return). This gives the same synchronous-portion coverage as the other guards, with the same documented post-`await` gap — acceptable parity.

---

## API-consistency and design gaps

### 3. `Statemachine.releaseLock(): Promise<void>` discards the mutex result

`src/Statemachine.ts:145-147` awaits `mutex.releaseLock()` and drops the boolean; `StatemachineInterface` declares `Promise<void>`. Users doing manual lock management (`autoreleaseLock: false` — the documented batch pattern in `docs/mutex.md`) have **no way to detect a failed release** short of interrogating the mutex directly. Companion to bug #1; recommend returning `Promise<boolean>` (breaking, so next major) or throwing on failure.

### 4. `Factory` cannot configure the v4 engine options

`Factory.createStatemachine` (`src/factory/Factory.ts:55-76`) passes only `initialStateName`, `transitionSelector`, and `mutex`. There is no way to give factory-created machines `maxQueueLength`, `maxAutomaticHops`, `autoreleaseLock`, `onChainedOperationError`, or `onReleaseError`. The fleet-of-machines use case is precisely where the diagnostics sinks and back-pressure matter most — a service creating a machine per order gets _none_ of the v4 hardening unless it abandons the Factory. Recommend a `StatemachineOptions` template on the Factory (constructor parameter or `setDefaultOptions()`), with the factory-owned fields (`initialStateName`, selector, mutex) layered on top.

### 5. `Event` is the mutable back door in an otherwise frozen graph

`State`, `Transition`, and `Process` are frozen at build time and construction-key protected — a genuinely strong invariant. `Event` breaks it: `attach()`, `detach()`, `setMetadataValue()`, `deleteMetadataValue()` are mutable forever, and the documented way to register commands is post-build mutation (`process.getState("draft").getEvent("publish").attach(...)`, per `docs/observers.md`).

Consequences:

- **Cross-machine shared state remains.** Events live on the shared `Process` graph, so event-attached observers and event metadata are global to every machine built from that process. The v4 fix for June finding #1 removed the _per-invocation args_ race, but the observer set and metadata are still shared mutable state — attaching a command "for" one machine attaches it to all of them.
- **`Event.invoke()` / `Event.notify()` are public** and bypass the engine entirely: no queue, no mutex, no re-entrancy guard. A user who calls `event.invoke(...)` directly gets observer side effects outside every serialization guarantee the engine provides.

**Recommendation (next major):** register commands at build time (`builder.addCommand(state, event, cb)` or similar), freeze `Event` with the rest of the graph, and drop `invoke`/`notify` from the public surface (or move event observers into the `Statemachine`, making them per-machine). Meanwhile, document the sharing hazard where `attach()` is taught.

### 6. `OnEnterObserver` still rides on a magic event-name convention

Carried over from the June review's design note, still open: an entry hook on state `approved` requires declaring a **sentinel self-transition** `addTransition("approved", "approved", { event: "onEnter" })` (the documented pattern in `docs/observers.md:327`). These sentinel edges pollute `GraphBuilder` exports, can collide with a real event named `onEnter`, and lean on the (intentional but subtle) no-op semantics of self-transitions. The `ifStateName` mechanism fixed the wrong-state bug; the deeper fix — first-class per-state entry hooks registered at build time — remains worth doing in the next major.

---

## Minor findings

7. **Live internal collections escape.** `getBeforeObservers()`/`getAfterObservers()` (`src/Statemachine.ts:121-123, 135-137`) return the live arrays; `Event.getObservers()` returns the live `Set`. The engine itself iterates snapshots, but external callers can observe mid-mutation state or cast-and-mutate. Return copies (the arrays are tiny) or a read-only wrapper.
8. **Deprecation debt is past its promised date.** `DispatcherInterface`/`CallbackInterface` are marked _"will be removed in v4"_ (`src/interfaces/DispatcherInterface.ts`) yet are still exported at v4.1.0; `Event.getInvokeArgs()` is a deprecated stub; `CallbackObserver`'s doc comment still says "In v3…". Remove in the next major, and re-date the promises now.
9. **Redundant cast.** `src/Statemachine.ts:370-372`: the `as TransitionInterface<TSubject> | null` on the selector result is unnecessary — verified that `tsc --noEmit` passes without it.
10. **`AmbiguousTransitionError` carries only a count.** Sibling errors (`StateNotFoundError`, `ProcessNotFoundError`) carry rich context; this one omits the state name, event, and candidate target names — the three things you need to debug an ambiguity. Cheap DX win.
11. **`TransitionFrame.machineName` is a misnomer.** It is the _process_ name (`src/Statemachine.ts:400`) — every machine sharing the process reports the same value — and it is typed `string | null` but never null. Rename to `processName` in the next major (or document the alias).
12. **`LockAdapterMutex` acquire race.** Two overlapping `acquireLock()` calls both pass the `!this.acquired` check before either await resolves, double-acquiring on a non-idempotent adapter (`src/mutex/LockAdapterMutex.ts:15-20`). The engine serializes its own calls, but the method is public. Memoizing the in-flight acquire promise closes it.
13. **`readonlyContext` is compile-time-only immutability**, and the single per-frame copy is shared by all observers of that frame — one observer casting and mutating affects later observers (`src/Statemachine.ts:464-471`). Acceptable trade-off; worth a sentence in the observer docs.
14. **`OperationQueue.dequeue` uses `Array.shift()`** — O(n) per dequeue. Irrelevant at sane queue depths; noted only because `maxQueueLength` defaults to `Infinity`. A ring buffer or head index is a 10-line fix if it ever matters.
15. **Mermaid output quotes state descriptions** — `s_x : "label"` (`src/graph/GraphBuilder.ts:177-178`). In `stateDiagram-v2` the text after `:` renders verbatim, so the quotes likely appear in the rendered diagram. Cosmetic; verify in a renderer and drop the quotes if unintended.

---

## Improvement opportunities

- **Close the post-`await` re-entrancy gap with `AsyncLocalStorage`.** `guardSync` (documented at `src/Statemachine.ts:193-198`) only catches re-entrant calls made before a callback's first `await`. `engines` requires Node ≥ 20, where ALS is stable; an opt-in (injected guard strategy, so the core stays runtime-agnostic for browser bundles) would convert the remaining silent deadlocks into `ReentrancyError`s.
- **`Timeout` is a passive condition** — it never schedules anything; someone must poll `checkTransitions()`. This is easy to miss from the class name. Document it prominently and/or ship a small opt-in scheduler helper (interval-driven `checkTransitions` with `whenIdle` coordination).
- **Introspection:** there is no way to ask the machine its queue depth or whether it is draining. Once teams set `maxQueueLength`, they will want a `getQueueLength()` / `isRunning()` for metrics.
- **`Observer.update(subject, args)` naming:** `subject` is the observable _Event_, while the machine's domain subject arrives as `args[0]`. Two meanings of "subject" in one call signature; rename the parameter (`source`?) in the next major.
- **Packaging:** the dual ESM/CJS setup (tsup, `exports` map with per-condition `types`) looks correct. Add an `@arethetypeswrong/cli` check to CI to lock it in.
- **Docs:** overall excellent (per-module references, migration guides, behavior-change notes). Gaps found: release-failure semantics (see bug #1), and the `Event.attach` cross-machine sharing hazard (see #5).

---

## Strengths worth preserving

- **Frozen graph, two-phase construction, symbol construction key.** The `State`/`Transition`/`Process` graph is immutable, cycle-safe by construction, and only obtainable through the validating builder. This is the architectural backbone and it is done right.
- **Builder validation quality:** unified name rules, endpoint checks, initial-state cardinality, conflict-vs-idempotent-duplicate distinction with a shared identity key, opt-in orphan detection — with typed, machine-readable errors (`GraphValidationError.code`) throughout.
- **The operation queue engine:** single enqueue entry point, a documented completion boundary (caller resolves only after lock release), chained-operation semantics with an error sink, back-pressure, and idle waiters. The inline comments state _contracts and constraints_, not narration — rare and valuable.
- **Error hierarchy:** every `FinitaError` subclass carries a stable `code` plus structured fields; native `RangeError` is consistently reserved for programmer errors (bad option values).
- **Test discipline:** 46 files / 369 tests, roughly one file per pinned behavior, including regression reproductions of past review findings (`resolve-after-release`, `event-args-race`, `late-enqueue`, `weight-selector-order`…).
- **Zero runtime dependencies**, dual-format packaging, CI matrix on Node 20/22/24 with CodeQL, OSV-Scanner, and gitleaks.

---

## Status of the June 2026 review (v3.0.1, `CODE_REVIEW.md`)

All ten findings verified fixed in the current source:

| #   | Finding (abbreviated)                              | Status in v4.1.0                                                                                                        |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `Event.invokeArgs` shared-state race               | Fixed — args passed through `Observer.update(subject, args)`; `getInvokeArgs()` is a deprecated stub                    |
| 2   | `StatefulStatusChanger` bound to one subject       | Fixed — `frame.subject` on the frame; observer defaults to it                                                           |
| 3   | `onEnter` resolves against wrong state             | Fixed — `ifStateName` guard on chained ops                                                                              |
| 4   | Re-entrant `triggerEvent` deadlock                 | Fixed — `ReentrancyError` via `guardSync` (documented post-`await` gap remains; see bug #2 for the `whenIdle` omission) |
| 5   | Cycle detector rejects legitimate loops            | Fixed — `maxAutomaticHops` bound replaces the visited set                                                               |
| 6   | `op.resolve()` before lock release                 | Fixed — resolve/reject moved after the `finally`; pinned by test                                                        |
| 7   | `EnqueueContext.enqueue` strands late ops          | Fixed — all enqueues route through `enqueueOperation`, which kicks the runner                                           |
| 8   | Duplicate check ignored weight                     | Fixed — weight in the conflict check                                                                                    |
| 9   | `WeightTransition` order-dependent epsilon tie     | Fixed — true max first, then epsilon window                                                                             |
| 10  | Empty-string `initialStateName` silently discarded | Fixed — `!== undefined` plus builder-level state-name validation                                                        |

The "Cleanup" section items also landed (shared composite base, unified name validation, shared `nameOrString` util, `Timeout` typed error + single `Date.now()`, `Dispatcher` deleted, `enqueueOperation` helper, shared transition key). The one open design note is the `OnEnterObserver` convention (finding #6 above).

---

## Suggested priority

1. **Bug #1** — handle `releaseLock() === false` (small, testable, closes a silent distributed-lock integrity hole).
2. **Bug #2** — guard `whenIdle()` (one line plus a test).
3. **#3** — decide the `releaseLock` return-type story alongside #1; update `docs/mutex.md`.
4. **#4** — Factory options passthrough (non-breaking, high leverage for the fleet use case).
5. Batch the next-major items (#5, #6, #8, #11, `Observer.update` rename) into a planned v5 scope rather than fixing piecemeal.

---

## Remediation status

Everything non-breaking was fixed on `fix/architecture-review-findings`; each fix landed test-first, with the failing test observed before the change.

| #        | Finding                                              | Status                                                                                                                            |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Bug 1    | `releaseLock()` returning false swallowed            | **Fixed** — new `LockCanNotBeReleasedError`; both failure modes normalized in one path                                            |
| Bug 2    | `whenIdle()` deadlock                                | **Fixed** — guarded with `assertNotReentrant`                                                                                     |
| 3        | `releaseLock()` discards the mutex result            | **Partly fixed** — failures now reach `onReleaseError`; the `Promise<boolean>` return type is deferred to v5 as breaking          |
| 4        | Factory cannot configure engine options              | **Fixed** — `FactoryStatemachineOptions` constructor template                                                                     |
| 7        | Live internal collections escape                     | **Fixed** — observer accessors return snapshots                                                                                   |
| 8        | Deprecation debt                                     | **Partly fixed** — notices re-dated to v5; removal is itself breaking                                                             |
| 9        | Redundant cast                                       | **Fixed**                                                                                                                         |
| 10       | `AmbiguousTransitionError` lacked context            | **Fixed** — carries `candidates`, rendered into the message                                                                       |
| 12       | `LockAdapterMutex` acquire race                      | **Fixed** — overlapping acquires share one in-flight promise                                                                      |
| 13       | `readonlyContext` immutability is nominal            | **Documented** in `docs/core.md`                                                                                                  |
| 15       | Mermaid label quoting                                | **Deferred** — needs verification in a real renderer; it is pinned by tests and docs, so it should not be changed on a hypothesis |
| 5, 6, 11 | `Event` mutability, `OnEnterObserver`, `machineName` | **Deferred to v5** — all breaking                                                                                                 |
| 14       | `OperationQueue` uses `shift()`                      | **Deferred** — irrelevant at realistic queue depths                                                                               |

Also documented in this pass: the passive nature of `Timeout` (`docs/conditions.md`) and the cross-machine sharing of event observers (`docs/observers.md`), both of which are easy to misread from the API alone.
