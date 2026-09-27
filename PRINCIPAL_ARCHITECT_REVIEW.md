# Principal architecture review: Finita 4.2.0

Date: 2026-09-26  
Reviewed commit: `127ba1858ccec2a46558bbe347d4c90a2cc6a61e`

## Assessment

Finita has a sound structure for an in-memory, asynchronous finite state machine. The separation between process construction and execution is useful, extension points are small, and the queue and observer contracts have substantial regression coverage. Keep this architecture; a rewrite would add risk without addressing the main weaknesses.

The remaining weaknesses sit at contract boundaries: synchronous versus asynchronous adapters, composed callbacks, generic types across the graph, and runtime collection ownership. Across the initial and extended reviews, I reproduced **seven implementation defects**. I also reproduced an **integration limitation** that matters when multiple machines operate on the same persisted subject: locking does not refresh their state snapshots.

I would first address uncertain lock ownership after release failures (F6), acquisition recovery (F1), deadlock detection (F2), and async diagnostic isolation (F7). Then close the graph mutation hole and strengthen type checks. Applications using shared persistence also need the ownership and transaction contract in A1. Large queue bursts and continuously chained events need separate throughput and scheduling controls, quantified in A2.

### Priorities

| ID  | Severity                                     | Finding                                                                    | Evidence                                                    |
| --- | -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| F1  | High                                         | A synchronous lock acquisition exception permanently prevents retries      | Executed reproduction                                       |
| F2  | High                                         | A later composite guard can bypass reentrancy detection and deadlock       | Executed reproduction                                       |
| F3  | Medium                                       | Building a process erases its subject type                                 | Strict TypeScript compilation plus runtime failure          |
| F4  | Medium                                       | A public getter exposes the mutable transition set                         | Executed reproduction                                       |
| F5  | Low                                          | Transition identity keys can collide for accepted names                    | Executed reproduction                                       |
| F6  | High                                         | Queued work continues under uncertain lock ownership after release failure | Redis fault-injection reproduction                          |
| F7  | High                                         | Async diagnostic-hook rejections escape isolation and can terminate Node   | Strict compilation and six child-process reproductions      |
| A1  | High, when using shared persistence          | Separate locked machines can commit the same stale transition              | Executed integration reproduction; architectural limitation |
| A2  | Medium, for large bursts or sustained chains | Queue drains delay timers; existing limits do not bound chained execution  | Paired benchmarks and bounded chain reproduction            |

High means the stated trigger can leave a machine or host process unusable, violate exclusive execution, or repeat business effects. Severity reflects impact under that trigger, not how often it occurs. All seven implementation findings have high confidence; F5 requires unusual input.

## Scope and validation

Reviewed the builder, graph model, runtime queue, conditions, selectors, observers, factory, mutexes, public interfaces, graph exporters, tests, package configuration, CI, and relevant documentation. Existing review documents were consulted to avoid reporting resolved issues as open.

Initial validation used Node.js `v22.22.2` and pnpm `9.15.0`:

| Check                          | Result                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| `pnpm test`                    | 389 tests passed across 48 files                                       |
| `pnpm run lint`                | Source and test type checks, plus ESLint, passed                       |
| `pnpm run build`               | ESM, CommonJS, and both declaration outputs built                      |
| `pnpm exec prettier --check .` | Passed before adding this report                                       |
| Package export smoke checks    | Both `import` and `require` constructed and executed a machine         |
| Focused runtime probes         | Confirmed F1, F2, F4, F5, and A1 against the built ESM package         |
| Strict consumer compilation    | Incorrect subject/process pairing compiled, then failed at runtime: F3 |

Reproduction scripts were temporary files under `/tmp`; production source and existing tests were unchanged. Snippets below capture the key triggers. The extension adds Node 20/24 test runs, isolated tarball consumers, a real Redis server, generated model comparisons, and queue benchmarks; see [Extended validation](#extended-validation). External diagram renderers, PostgreSQL advisory locks, and dependency vulnerabilities remain unassessed.

## Confirmed implementation findings

### F1. A synchronous acquisition exception permanently prevents retry

**Severity: High.** Locations: [LockAdapterMutex.ts](src/mutex/LockAdapterMutex.ts), lines 22–34; [LockAdapterInterface.ts](src/interfaces/LockAdapterInterface.ts).

`pendingAcquire` is assigned the result of an immediately invoked async function. If the adapter throws synchronously while evaluating the operand of `await`, the function's `finally` clears `pendingAcquire` before the outer assignment happens. The assignment then stores the rejected promise permanently. Later calls reuse it without calling the adapter again.

Synchronous implementations are explicitly allowed by `MaybePromise<boolean>`.

```javascript
let calls = 0;
const mutex = new LockAdapterMutex(
  {
    acquireLock() {
      if (++calls === 1) throw new Error("transient");
      return true;
    },
    releaseLock() {
      return true;
    },
    isLocked() {
      return false;
    },
  },
  "resource",
);

await mutex.acquireLock().catch(() => {});
await mutex.acquireLock().catch(() => {});
console.log(calls); // 1; expected a second adapter attempt
```

**Impact:** one transient exception makes every later operation using this mutex reject, even after the adapter recovers.

**Recommendation:** assign the pending promise before adapter invocation can run, for example by invoking the adapter in a `Promise.resolve().then(...)` chain and clearing the pending reference in the chain's `finally`. Preserve sharing of overlapping acquisitions.

**Regression coverage:** distinguish synchronous throw, asynchronous rejection, synchronous `false`, and asynchronous `false`; verify that each failure permits a later successful attempt. Existing retry coverage checks an async `false` result.

### F2. Composite conditions expand the reentrancy deadlock gap

**Severity: High.** Locations: [AndComposite.ts](src/condition/AndComposite.ts), lines 19–20; [OrComposite.ts](src/condition/OrComposite.ts), lines 19–20; [Statemachine.ts](src/Statemachine.ts), lines 209–220 and 394–405.

The machine guards the synchronous portion of each transition evaluation. Both composite conditions await each child, including children that return plain booleans. Consequently, later children run after the machine's synchronous guard has cleared.

A later child that immediately calls and awaits the same machine can therefore deadlock without any preceding user-written `await`:

```javascript
let sm;
const condition = new AndComposite(new Tautology()).addAnd(
  new CallbackCondition("reenter", () =>
    sm.checkTransitions().then(() => true),
  ),
);

const process = new ProcessBuilder("composite")
  .addState("a", { initial: true })
  .addState("b")
  .addTransition("a", "b", { event: "go", condition })
  .build();
sm = new Statemachine({}, process);
await sm.triggerEvent("go"); // Never settles
```

The executed probe confirmed entry into the second child and observed neither completion nor rejection within 100 ms. The wait cycle is structural: the running operation awaits a callback that awaits a queued operation behind itself. A later `OrComposite` child has the same exposure when earlier children return false.

**Impact:** the queue stops draining and the operation retains its lock. The documented restriction against reentrant callbacks still applies, but the promised synchronous detection does not reach these callbacks. This is a narrower, reproducible extension of the already documented async reentrancy limitation.

**Recommendation:** carry an execution context through condition composition so each child invocation receives the guard, or provide async execution-context detection for the supported runtime. Do not leave a global boolean set across an `await`; that would incorrectly reject legitimate external callers. General detection after arbitrary user awaits remains a separate design problem.

**Regression coverage:** second and nested children in AND and OR; `triggerEvent`, `checkTransitions`, and `whenIdle`; external calls while an unrelated async guard is pending.

### F3. The graph erases the subject type at `build()`

**Severity: Medium.** Locations: [ProcessBuilder.ts](src/ProcessBuilder.ts), line 119; [ProcessInterface.ts](src/interfaces/ProcessInterface.ts); [StateInterface.ts](src/interfaces/StateInterface.ts); [Statemachine.ts](src/Statemachine.ts), lines 55–58.

`ProcessBuilder<TSubject>.build()` returns a non-generic `Process`. The process and state interfaces also omit the subject parameter, and the machine accepts an unparameterized `ProcessInterface`. TypeScript cannot connect a graph's guard requirements to the subject supplied at runtime.

This consumer compiled successfully with `--strict` and no casts, then threw a `TypeError` in the guard:

```typescript
interface Order {
  total: number;
}

const process = new ProcessBuilder<Order>("typed")
  .addState("a", { initial: true })
  .addState("b")
  .addTransition("a", "b", {
    event: "go",
    condition: new CallbackCondition<Order>(
      "total",
      (order) => order.total.toFixed(2) === "1.00",
    ),
  })
  .build();

const sm = new Statemachine<string>("not an order", process);
await sm.triggerEvent("go");
```

**Impact:** callback bodies are typed, but the public assembly API allows incompatible subjects to reach them. The same erased process contract reaches factories and detectors.

**Recommendation:** propagate `TSubject` through `Process`, process/state collections, states, detectors, and machine constructor parameters. Test variance explicitly; adding generic parameters alone may leave holes through method assignability. Preserve safe reuse of guards that accept broader subjects.

**Regression coverage:** compile-time negative tests that reject incompatible process/subject and factory/process pairings, alongside positive inference tests. Existing generic tests exercise valid combinations but do not establish rejection of invalid ones.

### F4. `getTransitions()` exposes the mutable topology

**Severity: Medium.** Location: [State.ts](src/State.ts), lines 49–61.

The builder freezes each `State`, but its public accessor returns the actual internal `Set`. The `Iterable` return annotation hides mutators from ordinary TypeScript access; it does not protect JavaScript consumers or callers that narrow/cast the collection.

```javascript
const process = new ProcessBuilder("graph")
  .addState("a", { initial: true })
  .addState("b")
  .addTransition("a", "b", { event: "go" })
  .build();

process.getState("a").getTransitions().clear();
const sm = new Statemachine({}, process);
await sm.triggerEvent("go");
console.log(sm.getCurrentState().getName()); // "a"
```

**Impact:** one consumer can remove or inject edges for every machine sharing the process, bypassing builder validation. The event can remain registered while its transition disappears. This contradicts the documented frozen topology contract; it is separate from deliberately mutable event observers and shallow metadata values.

**Recommendation:** return a set iterator or a defensive snapshot, following the ownership discipline already used by observer accessors. Freezing the `Set` object itself would not disable its mutating methods.

**Regression coverage:** attempt mutation through public collection accessors and verify that the graph and two machines sharing it retain their behavior. `Object.isFrozen(state)` alone does not establish this guarantee.

### F5. Delimiter-based transition identities can collide

**Severity: Low.** Location: [ProcessBuilder.ts](src/ProcessBuilder.ts), lines 224–229 and 318–320.

Transition identity joins source, event, and target with NUL characters. Name validation permits embedded NUL characters, so distinct tuples can produce the same key:

```text
(source="a",      event="x\0y", target="z")
(source="a\0x",   event="y",    target="z")
```

I built a process containing both transitions with default conditions and weights. The second state's `y` event existed, but its transition collection was empty: deduplication had silently discarded that edge. Different conditions or weights would instead produce a false duplicate conflict.

**Impact:** graph corruption for unusual but currently accepted names, including names decoded from JSON.

**Recommendation:** use an unambiguous tuple encoding such as `JSON.stringify([fromState, eventName, toState])`, or nested maps. If control characters are intentionally unsupported, enforce and document that restriction explicitly.

**Regression coverage:** preserve both colliding tuples and retain idempotent deduplication of genuinely identical transitions.

### F6. A failed unlock leaves queued work trusting ownership that may be lost

**Severity: High.** Locations: [LockAdapterMutex.ts](src/mutex/LockAdapterMutex.ts), lines 37–49; [Statemachine.ts](src/Statemachine.ts), lines 253–260 and 293–315.

The mutex clears `acquired` only after a successful adapter response. An unlock can take effect remotely even when the adapter throws because the reply was lost. The machine rejects the operation whose release failed, but keeps draining its queue. The next operation sees `isAcquired() === true`, skips acquisition, and later skips release because it did not acquire the lock itself.

The initial review verified that release errors reach callers. This extension finds that **reporting the error does not make subsequent execution safe**.

I reproduced the failure against Redis 7.0.15 using independent mutexes and owner tokens, with no leases or expiration:

1. Machine A acquires the resource and commits `a -> b`.
2. Its adapter successfully executes an ownership-checked Redis deletion.
3. Before returning, the test starts machine B, which acquires the same resource and pauses in a before-observer while holding it.
4. A's adapter throws a simulated lost-reply error. This is deliberate fault injection after a real successful unlock.
5. A's already queued `next` operation runs and commits `b -> c` while Redis identifies B as the owner.

Observed result:

```text
A's first operation: rejected
A's queued next operation: fulfilled
A's final state: c
Redis owner during A's second transition: owner-b
A's adapter acquire calls: 1
A's adapter release calls: 1
```

B was still executing its own operation when A committed again. A healthy-adapter control correctly rejected competing acquisition and allowed a retry after release.

**Recommendation:** represent uncertain ownership explicitly. After release failure, prevent queued and future operations from silently reusing the old ownership flag. Define recovery through an ownership-aware adapter or machine/mutex replacement; reject or suspend pending work with an actionable error. Merely clearing the flag and retrying is insufficient when a failed release may also mean the old lock remains held, particularly with reentrant lock services.

**Regression coverage:** both ambiguous outcomes—remote unlock succeeded but response failed, and remote unlock never happened—plus queued operations present before the failure. Verify that no later observer runs until ownership is safely established.

### F7. Async diagnostic failures escape the hook isolation contract

**Severity: High under Node's tested default rejection behavior.** Locations: [Statemachine.ts](src/Statemachine.ts), lines 346–350 and 464–469; [StatemachineOptions.ts](src/interfaces/StatemachineOptions.ts), lines 32–42 and 55–62.

Both diagnostic hooks are called inside synchronous `try/catch` blocks. A rejected promise returned by an async hook is discarded. TypeScript accepts an async function where these `void` callbacks are expected, so strict compilation does not prevent the problem.

For example, attach a chained operation that fails and use an asynchronous error reporter:

```typescript
const sm = new Statemachine({}, process, {
  onChainedOperationError: async () => {
    throw new Error("diagnostic backend unavailable");
  },
});
sm.attachAfter({
  notify(_frame, ctx) {
    ctx.enqueue("missing-event");
  },
});
await sm.triggerEvent("go");
await sm.whenIdle();
```

Given a graph with `a --go--> b`, the top-level operation succeeds and the diagnostic promise rejects outside the engine's error handling. In isolated child processes, both this hook and `onReleaseError` terminated Node with exit code 1 on versions 20.19.1, 22.22.2, and 24.18.1. The triggering operation's promise was handled; the diagnostic rejection was the remaining unhandled error. No custom process rejection handler was installed.

**Impact:** an unavailable telemetry or logging backend can terminate an otherwise recoverable application operation. The hook comments promise to isolate hook failures, but currently cover only synchronous throws.

**Recommendation:** explicitly accept `MaybePromise<void>` and consume returned rejections as well as synchronous exceptions. A detached promise with an attached rejection handler can preserve nonblocking diagnostics. If hooks are instead awaited, define that lifecycle carefully so an error reporter cannot block the runner or create another reentrancy deadlock.

**Regression coverage:** sync throw, immediate async rejection, and delayed rejection for each hook; assert that the original outcome is preserved, the queue continues, and no process-level unhandled rejection occurs.

## Architectural findings

### A1. Locking serializes execution but does not establish fresh state

**Severity: High for applications sharing persisted subjects.** Locations: [Factory.ts](src/factory/Factory.ts), lines 81–94; [Statemachine.ts](src/Statemachine.ts), lines 62–65 and 293–304.

The factory reads the subject's state when constructing the machine. The machine retains that state internally. Later lock acquisition does not reload it or verify a persisted version.

The integration probe used only public built-in components:

1. Define `pending --approve--> approved`.
2. Use a factory with `StatefulStateNameDetector`, `StatefulStatusChanger`, and `MutexFactory`.
3. Create two machines for the same subject before either executes.
4. Give each its own mutex, backed by one shared adapter and resource name.
5. Await `approve` on the first machine, then on the second.

Both machines committed `pending -> approved`; an after-observer ran twice. There was no lock overlap or shared mutex instance. The second machine simply retained its original state, even though the subject had already changed.

**Extended evidence:** an isolated Redis-backed probe also stored the subject state and side-effect counter in Redis. Two machines loaded state `a` before either ran. Sequential execution produced persisted state `b` and counter `2`, despite successful exclusive lock acquisition and release for both operations. This confirms the limitation beyond the original in-memory adapter; it does not constitute a multi-host deployment test.

**Interpretation:** this is a lifecycle and persistence limitation, not a failure of mutual exclusion. A lock alone cannot make an old in-memory snapshot current. The same issue applies to long-lived machines and separately loaded copies of a database record.

**Recommendation:** explicitly define the supported ownership model:

- For in-memory use, one authoritative machine owns a subject's state; all operations route through it.
- For persisted use, acquire ownership before loading authoritative state, validate and persist with a version check or transaction, and release after commit. Reconstruct or refresh the machine within that boundary.
- For external side effects, use idempotency keys and, where needed, a transactional outbox. A failed after-observer does not undo an already committed transition.

An integration layer can implement this without turning the core FSM into a persistence framework. Add a documented reference integration and a two-worker test before claiming that lock adapters alone prevent state corruption across workers.

### A2. Queue throughput and event-loop fairness need different controls

**Severity: Medium for burst-heavy services; potentially higher for an unbounded synchronous event chain.** Locations: [OperationQueue.ts](src/internal/OperationQueue.ts), lines 18–34; [Statemachine.ts](src/Statemachine.ts), lines 253–260.

Two separate effects appeared in the extension:

- **Large backlogs drain slowly.** The queue removes each item with `Array.shift()`. A temporary copy of the built package using a head index substantially reduced the same workload's drain time. The paired measurements below support addressing this implementation cost if large backlogs are supported.
- **Promises do not guarantee scheduling fairness.** With synchronous guards, observers, and mutexes, the runner can keep scheduling microtasks without allowing timers to run. Faster dequeuing reduces a finite delay but does not impose a yield point on an endless chain.

A two-state `OnEnterObserver` cycle executed **20,001 transitions** with both `maxAutomaticHops: 1` and `maxQueueLength: 1`. A timer scheduled before the initiating event fired only after the test's explicit observer-detachment cutoff ended the chain. The run took approximately 44 ms on Node 22. The queue never needed more than one waiting event, and every chained transition was event-driven, so neither configured limit applied.

This is evidence of a resource-control gap, not a violation of a documented scheduling guarantee. Removing the test cutoff would leave the same chain generating work indefinitely. A timer-based cancellation or watchdog on that event loop would not interrupt it while it remains in microtasks. Real asynchronous I/O inside callbacks can introduce scheduling opportunities; this probe used synchronous callbacks and the default mutex.

**Recommendation:** independently consider a head-index/ring-buffer queue, an optional per-drain work or time budget that yields to the host scheduler, and a bound on observer-generated chains. Keep FIFO order and `whenIdle()` semantics across yields. Set finite queue limits according to application memory and latency needs; queue length alone cannot bound a one-in/one-out chain.

### Other decisions to make explicit

These are design tradeoffs, not additional confirmed defects:

- **Operation outcomes:** `Promise<void>` does not distinguish a valid event with no active transition from a committed transition. Rejection may also follow a commit because an after-observer or lock release failed. Consider a structured result/error envelope carrying the committed outcome to make retry decisions easier.
- **Cancellation:** define what cancellation means for already committed transitions, running side effects, and held locks. The execution-budget measurements in A2 show why a timer alone is not a sufficient cancellation mechanism.
- **Shared mutable collaborators:** events, conditions, and factory observers can be shared across machines. Keep per-subject state in the subject or operation context and document the sharing lifecycle. Mutable event observers and condition objects are already acknowledged in the documentation.
- **Documentation accuracy:** the event-processing sequence in [docs/core.md](docs/core.md) puts event validation before locking, while the implementation locks first. It also omits event observers and guard selection. The options table omits queue limits, hop limits, and diagnostic hooks. Update it to show actual execution and failure boundaries.

## Strengths to preserve

- **Builder/runtime separation:** two-phase construction preserves target identity in cyclic graphs, and validation catches missing endpoints, duplicate conflicts, invalid weights, and optional unreachable states before execution.
- **Observer phases:** before-observers can veto; after-observers all run and aggregate errors. The code and tests largely make the commit boundary clear.
- **Queue ownership:** one runner serializes each machine's operations, while an explicit enqueue handle supports after-observer chaining without inline recursion.
- **Failure diagnostics:** typed errors, ambiguity candidates, chained-operation hooks, and release-error hooks provide useful context to integrators.
- **Small dependency surface:** zero runtime dependencies, strict compilation, ESM/CommonJS artifacts, and regression tests keep the core easy to embed and maintain.

## Extended validation

### Runtime and package compatibility

The source revision remained unchanged throughout the extension.

| Runtime      | Existing test suite              | Installed tarball: ESM | Installed tarball: CommonJS |
| ------------ | -------------------------------- | ---------------------- | --------------------------- |
| Node 20.19.1 | 389/389 passed, 48 files         | Passed                 | Passed                      |
| Node 22.22.2 | 389/389 passed in initial review | Passed                 | Passed                      |
| Node 24.18.1 | 389/389 passed, 48 files         | Passed                 | Passed                      |

The package was packed locally and installed offline into a clean consumer under `/tmp`. Consumer imports resolved `@camcima/finita` from the installed package, without workspace aliases or source imports. Both module formats constructed a typed guarded process, executed a transition, checked typed subject access, checked exported error inheritance, and awaited idle.

TypeScript 6.0.3 compiled the installed declarations with `strict: true`, `skipLibCheck: false`, `lib: ["ES2022"]`, and no ambient Node types. NodeNext resolution passed for `.mts` and `.cts` consumers; Bundler resolution also passed for the ESM consumer. The async hooks in F7 were separately confirmed to compile under these settings.

**Conclusion:** no packaging or ordinary module-resolution defect was found in this matrix. This does not establish compatibility with every version permitted by `node >=20.0.0`, earlier TypeScript compilers, browsers, or every bundler. It also does not repair the subject-type relationship in F3.

### Generated execution checks

An independent sequential model was compared with the real queued engine for **200 generated graphs and 12,000 operations**, using seed `0x5eed1234`. Each graph contained eight states, optional guarded event edges, self-transitions, and forward-only automatic edges to ensure termination. Inputs mixed valid events, missing events, automatic checks, and per-operation guard context. All operations for a graph were submitted without awaiting each individually.

The comparison checked:

- Per-operation success or expected error, current state, and last state.
- The exact sequence of committed transition frames.
- Before-observers seeing the source state and after-observers seeing the target state, including asynchronous observer yields.
- Canonical target-state identity for every edge.
- Exactly one lock acquisition and release per operation, including rejected events, and an unlocked machine at idle.

All cases matched: **4,133 committed transitions and 4,931 expected event rejections**. This adds confidence in ordinary serialization and graph execution. It does not cover arbitrary plugins, selector ambiguity, cancellation, or every failure interleaving.

### Queue benchmark

Environment: Linux x86_64, Intel Core Ultra 7 155H, Node 22.22.2, `--expose-gc`. Measurements are medians of three runs after warm-up. Baseline and comparison runs were interleaved with alternating order. Each sample forced GC before measurement.

Workload: burst-submit `N` calls to `checkTransitions()` on a one-state graph with no transitions and a default mutex; await every result and `whenIdle()`. A zero-delay timer was scheduled immediately before enqueueing. This measures engine overhead under backlog, without application I/O.

| Operations | Current drain after enqueue (ms) | Temporary indexed-queue drain (ms) | Current timer delay (ms) | Current heap growth at end of enqueue (MiB) |
| ---------- | -------------------------------- | ---------------------------------- | ------------------------ | ------------------------------------------- |
| 1,000      | 1.62                             | 1.33                               | 2.34                     | 0.91                                        |
| 10,000     | 17.46                            | 11.69                              | 21.10                    | 8.94                                        |
| 50,000     | 900.97                           | 51.24                              | 921.14                   | 27.31                                       |
| 100,000    | 3,206.65                         | 86.14                              | 3,252.44                 | 48.47                                       |

The comparison changed only `OperationQueue` in a temporary copy of the built ESM file: dequeue advanced an index, cleared consumed slots, and reset storage when empty. No production fix was applied. The 100,000-operation drain was about **37 times faster** in that experiment; this is a diagnostic comparison, not a validated replacement implementation or a promised production speedup.

Timer delay includes enqueueing and draining. Heap growth includes the benchmark's retained caller promises and operation contexts; it is not a queue-only allocation count or a peak-memory measurement. Small timings are sensitive to JIT, GC, and host load. The meaningful result is the sharp cost increase at large backlogs and its reduction when dequeue avoids shifting.

### Lock-service scope and remaining limits

Redis 7.0.15 ran as a temporary local process with persistence disabled and a private Unix socket, without a TCP listener. Lock adapters used `SET NX` and ownership-checked deletion with separate owner tokens. The tests covered healthy contention/retry, persisted stale state, and the explicitly injected lost-unlock-reply scenario in F6. The server was stopped after the probes.

The loss of the unlock reply was simulated after the real deletion succeeded; no network fault or Redis crash was induced. Multi-host scheduling, PostgreSQL advisory-lock sessions, lease expiration, and fencing remain outside this review. Diagram output has not been tested in an external renderer. Dependency security was not re-audited.

Temporary evidence is under `/tmp/finita-extended-review`: `redis-probes.mjs`, `hook-probe.mjs`, `model-probe.mjs`, `bench.mjs`, `bench-compare.mjs`, the benchmark JSONL files, and the isolated `consumer` project. These are local investigation artifacts and may disappear when temporary storage is cleaned.

## Recommended sequence

1. **Lock ownership and recovery:** fix F6 and F1 together. Define held, released, acquiring, and uncertain ownership states; cover queued work following failures.
2. **Callback isolation:** address F2 and F7 while preserving legitimate concurrent callers and nonblocking diagnostics.
3. **Graph guarantees:** close F4 and replace the ambiguous identity encoding in F5.
4. **Public type contract:** plan F3 with compatibility analysis and negative consumer compilation tests.
5. **Integration contract:** document A1, add a persisted-state reference example, and clarify operation outcomes after partial success.
6. **Load behavior:** use A2's measurements to set supported queue sizes, improve dequeue cost, and define yielding and chain limits where needed.
7. **Continuous verification:** promote the generated model checks and installed-package consumer matrix into maintainable CI tests. Preserve the separate fault-injection probes as regression cases for lock recovery and diagnostic failures.

Retain the existing review files as historical records. Previously reported release-error reporting, synchronous `whenIdle()` protection, factory option forwarding, and observer snapshot fixes are present in this revision. F6 extends the release analysis to subsequent queued operations under ambiguous ownership; F7 extends diagnostic isolation to returned promise rejections.

## Remediation status

Every implementation finding was reproduced independently before it was fixed. Each fix landed test-first, with the failing test observed before the change, and the reproductions above were rerun against the built package afterwards.

| ID  | Finding                                         | Status                                                                                                                                                                                                 |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Synchronous acquire throw prevents retries      | **Fixed** in #74. The in-flight acquire is cleared after it is stored.                                                                                                                                 |
| F2  | Composite guard bypasses reentrancy detection   | **Fixed** in #74 for synchronous children, including nested composites and `Not`. A child that re-enters after its own `await` remains the documented gap tracked in #59.                              |
| F3  | Building a process erases its subject type      | **Deferred to v5** as #72. Adding type parameters to exported interfaces is breaking.                                                                                                                  |
| F4  | `getTransitions()` exposes the mutable topology | **Fixed** in #74. The accessor returns a snapshot.                                                                                                                                                     |
| F5  | Transition identity keys can collide            | **Fixed** in #74. Keys are JSON tuples.                                                                                                                                                                |
| F6  | Queued work continues under uncertain ownership | **Fixed** in #75, which merged into #74. A failed release of a held lock blocks further operations with `LockOwnershipUncertainError` until a manual release succeeds.                                 |
| F7  | Async diagnostic-hook rejections escape         | **Fixed** in #74. Returned promises get a rejection handler and are not awaited. The option types stay `=> void`, because widening them rejected ordinary callbacks that return a value.               |
| A1  | Locked machines can commit the same stale state | **Documented** in this PR under "Locks and persisted state" in `docs/mutex.md`, with a two-worker test pinning both the limitation and the recommended pattern.                                        |
| A2  | Queue drain cost and unbounded chains           | **Dequeue fixed** in #74, closing #63. A bound on observer-chained operations is tracked in #73. A time budget that yields to the host scheduler was judged not worth its complexity.                  |
| —   | `docs/core.md` processing sequence and options  | **Fixed** in this PR. The flow now locks before validating the event and includes event observers, guard selection, and failure boundaries. The options table lists every `StatemachineOptions` field. |

The review's other design notes, structured operation outcomes and cancellation semantics, are not tracked as issues. They remain open questions for a future major version.
