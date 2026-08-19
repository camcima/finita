# Changelog

## [4.2.0](https://github.com/camcima/finita/compare/v4.1.0...v4.2.0) (2026-08-19)

Remediation of the 2026-08 architecture review ([#52](https://github.com/camcima/finita/pull/52)). Full notes: [v4.2.0 release](https://github.com/camcima/finita/releases/tag/v4.2.0).

### Features

* `Factory` accepts a `FactoryStatemachineOptions` template, forwarding engine options to every machine it creates ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))
* add `LockCanNotBeReleasedError` for a release that fails by returning `false` ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))
* add `AmbiguousTransitionError.candidates` carrying the competing transitions ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))

### Bug Fixes

* surface a failed lock release instead of resolving as if the lock were freed ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))
* guard `whenIdle()` against re-entrant calls that deadlocked the machine ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))
* share one in-flight acquire in `LockAdapterMutex` ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))
* return observer snapshots from the accessor methods ([f67bb12](https://github.com/camcima/finita/commit/f67bb127134e2f710cc3d9640705c8b2f3108a0c))

## [4.1.0](https://github.com/camcima/finita/compare/v4.0.0...v4.1.0) (2026-07-10)

### Features

* add maxQueueLength back-pressure option ([83a425b](https://github.com/camcima/finita/commit/83a425b3a18f422e1e6dabdf952e9a5efe153d21))
* add onChainedOperationError sink and document completion boundary ([0d94ddf](https://github.com/camcima/finita/commit/0d94ddf161b1ca195f473574c81116c559508e91))
* add onReleaseError diagnostic hook for lock release failures ([f6058bc](https://github.com/camcima/finita/commit/f6058bcc3bf580022d50ee49cbf08bdfbdc504a9))
* add Statemachine.whenIdle() to await full queue drain ([14d601b](https://github.com/camcima/finita/commit/14d601b46984fd97e307e310478c93646ce2af48))

### Bug Fixes

* freeze State and Transition to match documented immutability ([d466c7d](https://github.com/camcima/finita/commit/d466c7d0a1b27c11e9708e884549cfd6a2a8f489))
* keep ProcessBuilder reusable after a failed build ([457da0c](https://github.com/camcima/finita/commit/457da0c7f4b10c2056dd346684c595d290363965))
* make Statemachine observer attach idempotent ([aeba9db](https://github.com/camcima/finita/commit/aeba9db1f2f5415242f2c3493f229a06cd9e96fd))
* restrict graph rankdir/direction options to valid values ([6607d81](https://github.com/camcima/finita/commit/6607d819954d5e2a1b594ecef5a2538d6911b9c2))
* validate transition weights and WeightTransition epsilon ([98b07b2](https://github.com/camcima/finita/commit/98b07b20f3c39a6e05d61a35ee170c09c6ed1fe2))

## [4.0.0](https://github.com/camcima/finita/compare/v3.0.1...v4.0.0) (2026-06-23)

### Features

* **observer:** expose subject on TransitionFrame; share one frame per transition ([44ae06c](https://github.com/camcima/finita/commit/44ae06c38d9f924fce507064d8938939c40134bc))

### Bug Fixes

* **builder:** detect conflicting weights on duplicate transitions, unify identity key ([fbd571d](https://github.com/camcima/finita/commit/fbd571d7dad7e61fabf03819fcc2e2bd6888baec))
* **builder:** validate state names; unify name rule across state/event/condition ([ac7b38d](https://github.com/camcima/finita/commit/ac7b38d08004444bd467c51a2dbbe17c55d266d8))
* **condition:** timeout throws InvalidSubjectError; allocation-free time check ([4ab8a8e](https://github.com/camcima/finita/commit/4ab8a8ecfc8d84d49e1e2df9dbbd49a397a4b344))
* **event:** pass invoke args to observers; drop racy invokeArgs field; inline Dispatcher ([8bb6581](https://github.com/camcima/finita/commit/8bb6581410c617b94ed7b2ad83725b4d51029c2d))
* **graph:** escape backslashes in DOT/mermaid output; guard event lookup in labels ([2f3fd72](https://github.com/camcima/finita/commit/2f3fd7209244b1aa151b4f44349ebf54c46dbe15))
* **observer:** onEnter fires only for rest states via enqueue ifStateName guard ([726024a](https://github.com/camcima/finita/commit/726024a79a2292757bee3e832fa1d386c3323f9b))
* **observer:** statefulStatusChanger writes to frame.subject; correct factory docs ([d72ce2b](https://github.com/camcima/finita/commit/d72ce2bc7993868b5f2898d837326c8e449b99fd))
* **selector:** make WeightTransition epsilon ties order-independent ([44f30d2](https://github.com/camcima/finita/commit/44f30d2fa01841d2137b3ce3998a93ef4f8ecece))
* **statemachine:** bound automatic loops with maxAutomaticHops instead of first-revisit detection ([16cc1b5](https://github.com/camcima/finita/commit/16cc1b5fbe08c17d78bd3a472c00cc478b94eb29))
* **statemachine:** guard every event observer and transition condition against re-entrancy ([cb80489](https://github.com/camcima/finita/commit/cb80489702d00e57a9adcb381bb4159bd95e06de)), closes [#29](https://github.com/camcima/finita/issues/29)
* **statemachine:** kick runner from EnqueueContext.enqueue; single enqueue path ([7e84451](https://github.com/camcima/finita/commit/7e8445106ab37cfdc476ccbf6dec29f714d91e94))
* **statemachine:** reject (not throw) on re-entrancy; broaden re-entrancy tests ([5ad2514](https://github.com/camcima/finita/commit/5ad251432fe33625f022b4990182619499925d08))
* **statemachine:** reject empty initialStateName instead of silently restarting ([36272aa](https://github.com/camcima/finita/commit/36272aa9375df186e1aca4fa3f2d741349e5d694))
* **statemachine:** settle caller promise only after mutex release completes ([7501123](https://github.com/camcima/finita/commit/7501123521ee53158380589c1fb2c904e4cc4e4c))
* **statemachine:** snapshot observer lists before notifying ([eed53a7](https://github.com/camcima/finita/commit/eed53a75cd6a24b3fca96e8ebe988ce90fd61aa6))
* **statemachine:** surface lock-release failures; guard selector; restore zero-arg callback ([129280b](https://github.com/camcima/finita/commit/129280bbfce9ae87dedbb539a663c3e96e4941c1))
* **statemachine:** throw ReentrancyError on re-entrant trigger instead of deadlocking ([3655026](https://github.com/camcima/finita/commit/3655026be68c485fcd3d5a71b19721451d23403f))
* **statemachine:** validate maxAutomaticHops is a positive integer ([e9a4001](https://github.com/camcima/finita/commit/e9a400180492c63bc36382b4c7ed103444a71bbc))

## [3.0.1](https://github.com/camcima/finita/compare/v3.0.0...v3.0.1) (2026-05-30)

### Features

* **builder:** introduce ProcessBuilder and freeze graph ([d9a9209](https://github.com/camcima/finita/commit/d9a920937371ecf2afb0982f065f9e6c074cda06)), closes [#3](https://github.com/camcima/finita/issues/3) [#5](https://github.com/camcima/finita/issues/5) [#6](https://github.com/camcima/finita/issues/6)
* **builder:** reject empty/whitespace condition names ([0de6159](https://github.com/camcima/finita/commit/0de615935b6b09efc7e0bc2ddc855fe86817803c))
* **builder:** reject whitespace-padded event names; rename code to invalidEventName ([8dbd3a7](https://github.com/camcima/finita/commit/8dbd3a7e0f42e5c5b5aaa496ce8f254438b65439))
* **error:** add AmbiguousTransitionError and retrofit OneOrNoneActiveTransition ([e7028db](https://github.com/camcima/finita/commit/e7028dbd97f9bed58022f0beebad2feb8da04efa))
* **error:** add AutomaticTransitionCycleError and retrofit Statemachine ([821156b](https://github.com/camcima/finita/commit/821156b9b6b76b5853c753488a82494bdee9bb17))
* **error:** add DuplicateTransitionError ([905fc72](https://github.com/camcima/finita/commit/905fc72f5ffc304a35193e5287c28e54b5792caa))
* **error:** add GraphValidationError with typed code ([5027b73](https://github.com/camcima/finita/commit/5027b73194f812eea864b4743f0eb1b1211a1d9f))
* **error:** add InvalidSubjectError and retrofit StatefulStateNameDetector ([2dd9a89](https://github.com/camcima/finita/commit/2dd9a89d9b9729e1f44c04757ab6cccb25df8cad))
* **error:** add ProcessFinalizedError ([e8b82a2](https://github.com/camcima/finita/commit/e8b82a2f788ba6cd25c614de2cae9fb62179dc37))
* **error:** add ProcessNotFoundError and retrofit AbstractNamedProcessDetector ([10e5fd0](https://github.com/camcima/finita/commit/10e5fd017c5591d606a3b1b7142c0fdf63a1a0ff))
* **error:** add StateEventNotFoundError and retrofit State.getEvent ([6db3b6d](https://github.com/camcima/finita/commit/6db3b6d3a065eb7825e3230cf55f912c2075da4d))
* **error:** add StateNotFoundError and retrofit StateCollection.getState ([1a2ac20](https://github.com/camcima/finita/commit/1a2ac20a7186426963b646c510710184e3d03f16))
* **error:** export FinitaError and new error classes from package entry ([84a6c80](https://github.com/camcima/finita/commit/84a6c807181ef621760a5739bed4c5151aaac0cc))
* **error:** introduce FinitaError base; retrofit existing classes with code discriminant ([527be3d](https://github.com/camcima/finita/commit/527be3d15e2d7778a2950a8cc8e6b54ba8e2ab9b))
* **interfaces:** add BeforeTransitionObserver and AfterTransitionObserver ([66a920c](https://github.com/camcima/finita/commit/66a920c83fbab10c888f10d4aa49b116cd659ac6))
* **interfaces:** add StatemachineOptions type ([8c415f9](https://github.com/camcima/finita/commit/8c415f915c141486967e53bdb791f9cd4a703eca))
* **interfaces:** add TransitionFrame and ProposedTransitionFrame ([ab5f8d2](https://github.com/camcima/finita/commit/ab5f8d2c818332fb9bbdf2a5a4796c3b59b1cb69))
* **internal:** add construction key symbol for graph classes ([aa17a1c](https://github.com/camcima/finita/commit/aa17a1c5b0f67acc51e2b8f969c8bb22b22603e8))
* **internal:** add OperationQueue for FIFO Statemachine operations ([7dbb4aa](https://github.com/camcima/finita/commit/7dbb4aad81ebd30f4f95e2b2361ce6a177cc2be5))
* migrate Factory and remove SetupHelper/StateCollectionMerger ([19cdd59](https://github.com/camcima/finita/commit/19cdd59c0e217d57f1fbb8ec6418324614c5596d))
* **observer:** migrate TransitionLogger, StatefulStatusChanger, CallbackObserver to v3 ([af9d082](https://github.com/camcima/finita/commit/af9d0826b3bae76a68d1d65ed922d4d46b16772f))
* **observer:** reborn OnEnterObserver as queueing after-observer ([a76e88a](https://github.com/camcima/finita/commit/a76e88ae13297d4856a6eb2ea6fd46bf9d89e018))
* **statemachine:** rewrite execution engine ([283404b](https://github.com/camcima/finita/commit/283404b14dfa394c5fb8abae2b2da5d448638d5e)), closes [#1](https://github.com/camcima/finita/issues/1) [#4](https://github.com/camcima/finita/issues/4)

### Bug Fixes

* **builder:** correct transition target identity under cycles ([7fbbf90](https://github.com/camcima/finita/commit/7fbbf907f9e70562619bf77d5c2e04ba4bb6b1f4))
* **builder:** point transitions at final State instances ([8444883](https://github.com/camcima/finita/commit/8444883fd69d6b9c5611a26a30ac36248d45ea29))
* **builder:** treat different condition instances as conflicts regardless of name ([8a36af0](https://github.com/camcima/finita/commit/8a36af0d2a03356401e6cf6ae7c77df267337c23)), closes [#6](https://github.com/camcima/finita/issues/6)
* **ci:** pin pnpm to 9.15.0 and ignore basic-ftp dev-only advisory ([7472321](https://github.com/camcima/finita/commit/7472321953889518b95b2a32670639d530256841))
* **graph:** make GraphBuilder.addState idempotent (closes [#14](https://github.com/camcima/finita/issues/14)) ([95800db](https://github.com/camcima/finita/commit/95800dbcafaf0ce9164fad97b714855b6e73843b))
* **mutex:** runoperation honors an already-held mutex ([4d28dad](https://github.com/camcima/finita/commit/4d28dad101edb6abdc69187fc1702398c9491513))
* **security:** override undici to resolve OSV-Scanner vulnerabilities ([7aba9c1](https://github.com/camcima/finita/commit/7aba9c110ae69b0ed81d12a8323faa5df5532b76))
* **statemachine:** event observers fire on event resolution ([5757c23](https://github.com/camcima/finita/commit/5757c23e40cd1ffddc10d6effe7e7b3f1fa54946))

## [2.2.0](https://github.com/camcima/finita/compare/v2.1.0...v2.2.0) (2026-04-06)

### Bug Fixes

* **build:** add ignoreDeprecations for tsup baseUrl TS6 compat ([e5f66dd](https://github.com/camcima/finita/commit/e5f66ddcb5453622b17a172326ba11b403d184dd))
* **deps:** resolve known vulnerabilities in dev dependencies ([fb394d3](https://github.com/camcima/finita/commit/fb394d3011c031ba1088c7334f923dc4e67d7abd))
* drop Node.js 18 from CI matrix ([b6ce0f2](https://github.com/camcima/finita/commit/b6ce0f21c50ffcb1cd14c564154095c6ba1050c3))

### Reverts

* restore vitest v3 and Node.js 18 support ([da591ec](https://github.com/camcima/finita/commit/da591ec05a7e2862f8fe70601bc16dc4440d35b5))

## [2.1.0](https://github.com/camcima/finita/compare/v2.0.0...v2.1.0) (2026-04-04)

### Features

* add dual ESM/CJS build with tsup ([2f390ba](https://github.com/camcima/finita/commit/2f390bace6ca21c1537d3e74a9234abbd8ae7ba5))

### Bug Fixes

* add @types/node for setTimeout in test tsconfig ([e7f174c](https://github.com/camcima/finita/commit/e7f174c5b757eac699d2f36feb3c53489581d82d))

## [2.0.0](https://github.com/camcima/finita/compare/v1.0.0...v2.0.0) (2026-03-25)

### Features

* add TSubject generic parameter for type-safe subject access ([d3ffc3c](https://github.com/camcima/finita/commit/d3ffc3c9bff30d1df6d85c22741d780bccf038be))

## 1.0.0 (2026-03-25)
