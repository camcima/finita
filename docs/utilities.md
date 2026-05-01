# Utilities

> **v3 note:** `SetupHelper` and `StateCollectionMerger` were removed in v3. Their use cases are now covered directly by `ProcessBuilder`. See the [v2-to-v3 migration guide](migration/v2-to-v3.md) for details.

There are no utility classes in v3. All graph construction is handled by `ProcessBuilder`:

```typescript
import { ProcessBuilder } from "@camcima/finita";

const process = new ProcessBuilder("myProcess")
  .addState("initial", { initial: true })
  .addState("step2")
  .addState("final")
  .addTransition("initial", "step2", { event: "go" })
  .addTransition("step2", "final", { event: "finish" })
  .build();
```

For merging sub-workflows that were previously handled by `StateCollectionMerger`, use `ProcessBuilder` with prefixed state names:

```typescript
import { ProcessBuilder } from "@camcima/finita";

// Instead of merging separate StateCollections, declare all states in one builder
const process = new ProcessBuilder("main")
  .addState("start", { initial: true })
  // Sub-workflow A states (prefixed)
  .addState("sub_a_init")
  .addState("sub_a_done")
  // Sub-workflow B states (prefixed)
  .addState("sub_b_init")
  .addState("sub_b_done")
  .addTransition("start", "sub_a_init", { event: "startA" })
  .addTransition("sub_a_init", "sub_a_done", { event: "go" })
  .addTransition("start", "sub_b_init", { event: "startB" })
  .addTransition("sub_b_init", "sub_b_done", { event: "go" })
  .build();
```
