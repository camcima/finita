import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { ConditionInterface } from "./interfaces/ConditionInterface.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { Process } from "./Process.js";
import { State } from "./State.js";
import { Transition } from "./Transition.js";
import { DuplicateStateError } from "./error/DuplicateStateError.js";
import { ProcessFinalizedError } from "./error/ProcessFinalizedError.js";
import { GraphValidationError } from "./error/GraphValidationError.js";
import { DuplicateTransitionError } from "./error/DuplicateTransitionError.js";

interface StateSpec {
  name: string;
  initial: boolean;
  metadata: Map<string, unknown>;
}

interface TransitionSpec<TSubject = unknown> {
  fromState: string;
  toState: string;
  eventName: string | null;
  condition: ConditionInterface<TSubject> | null;
  weight: number;
}

export interface AddStateOptions {
  initial?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AddTransitionOptions<TSubject = unknown> {
  event?: string;
  condition?: ConditionInterface<TSubject>;
  weight?: number;
}

export interface BuildOptions {
  /**
   * When true, orphan/unreachable states cause GraphValidationError.
   * When false (default), orphan states are silently allowed.
   */
  strictOrphans?: boolean;
}

export class ProcessBuilder<TSubject = unknown> {
  private readonly processName: string;
  private readonly stateSpecs: Map<string, StateSpec> = new Map();
  private readonly transitionSpecs: TransitionSpec<TSubject>[] = [];
  private built = false;

  constructor(processName: string) {
    this.processName = processName;
  }

  addState(name: string, options: AddStateOptions = {}): this {
    if (this.built) {
      throw new ProcessFinalizedError(this.processName);
    }
    if (this.stateSpecs.has(name)) {
      throw new DuplicateStateError(name);
    }
    this.stateSpecs.set(name, {
      name,
      initial: options.initial === true,
      metadata: new Map(Object.entries(options.metadata ?? {})),
    });
    return this;
  }

  addTransition(
    fromState: string,
    toState: string,
    options: AddTransitionOptions<TSubject> = {},
  ): this {
    if (this.built) {
      throw new ProcessFinalizedError(this.processName);
    }
    let eventName: string | null = null;
    if (options.event !== undefined) {
      if (options.event.trim() === "") {
        throw new GraphValidationError(
          "emptyEventName",
          `addTransition called with an empty/whitespace event name from "${fromState}" to "${toState}"`,
          { fromState, toState },
        );
      }
      eventName = options.event;
    }
    this.transitionSpecs.push({
      fromState,
      toState,
      eventName,
      condition: options.condition ?? null,
      weight: options.weight ?? 1,
    });
    return this;
  }

  build(options: BuildOptions = {}): Process {
    if (this.built) {
      throw new ProcessFinalizedError(this.processName);
    }
    this.built = true;

    this.validateInitialState();
    this.validateTransitionEndpoints();
    this.validateNoConflictingDuplicates();

    const initialName = this.findInitialStateName();
    const eventNamesByState = this.collectEventNamesByState();

    // Build states using depth-first construction (leaves first) so that each
    // Transition.getTargetState() returns the exact State instance that
    // Process.getState() exposes — referential identity is guaranteed for
    // acyclic graphs.  Cycles are handled by creating a stub for states that
    // are already in progress, then rebuilding their transitions in a second
    // sweep once all states exist (same three-pass logic, scoped to the cycle).
    const finalStates = this.buildStatesLeafFirst(eventNamesByState);

    if (options.strictOrphans) {
      this.validateOrphans(finalStates, initialName);
    }

    const initialState = finalStates.get(initialName)!;
    return new Process(
      INTERNAL_CONSTRUCTION_KEY,
      this.processName,
      initialState,
      finalStates.values(),
    );
  }

  // --- private helpers ---

  private validateInitialState(): void {
    const initials = Array.from(this.stateSpecs.values()).filter(
      (s) => s.initial,
    );
    if (initials.length === 0) {
      throw new GraphValidationError(
        "missingInitialState",
        `Process "${this.processName}" has no state declared with { initial: true }`,
        { processName: this.processName },
      );
    }
    if (initials.length > 1) {
      throw new GraphValidationError(
        "multipleInitialStates",
        `Process "${this.processName}" declares multiple initial states: ${initials.map((s) => `"${s.name}"`).join(", ")}`,
        {
          processName: this.processName,
          initialStates: initials.map((s) => s.name),
        },
      );
    }
  }

  private findInitialStateName(): string {
    return Array.from(this.stateSpecs.values()).find((s) => s.initial)!.name;
  }

  private validateTransitionEndpoints(): void {
    for (const t of this.transitionSpecs) {
      if (!this.stateSpecs.has(t.fromState)) {
        throw new GraphValidationError(
          "unknownSource",
          `Transition source state "${t.fromState}" was not declared with addState`,
          {
            fromState: t.fromState,
            toState: t.toState,
            eventName: t.eventName,
          },
        );
      }
      if (!this.stateSpecs.has(t.toState)) {
        throw new GraphValidationError(
          "unknownTarget",
          `Transition target state "${t.toState}" was not declared with addState`,
          {
            fromState: t.fromState,
            toState: t.toState,
            eventName: t.eventName,
          },
        );
      }
    }
  }

  private validateNoConflictingDuplicates(): void {
    // Identity key: (fromState, eventName, toState).
    // Two specs with the same identity but different condition instances AND
    // different condition names → conflict (DuplicateTransitionError).
    // Same identity + (same instance OR same name) → dedup (silently keep one).
    const seen = new Map<string, TransitionSpec<TSubject>>();
    for (const t of this.transitionSpecs) {
      const conditionName = t.condition ? t.condition.getName() : null;
      const key = `${t.fromState}\x00${t.eventName ?? ""}\x00${t.toState}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, t);
        continue;
      }
      const existingConditionName = existing.condition
        ? existing.condition.getName()
        : null;
      const conflict =
        existing.condition !== t.condition &&
        existingConditionName !== conditionName;
      if (conflict) {
        throw new DuplicateTransitionError({
          fromState: t.fromState,
          toState: t.toState,
          eventName: t.eventName,
          existingConditionName,
          newConditionName: conditionName,
        });
      }
      // Same identity AND (same instance OR same condition name) → dedup.
    }
  }

  private collectEventNamesByState(): Map<string, string[]> {
    const out = new Map<string, Set<string>>();
    for (const t of this.transitionSpecs) {
      if (t.eventName === null) continue;
      let bucket = out.get(t.fromState);
      if (!bucket) {
        bucket = new Set();
        out.set(t.fromState, bucket);
      }
      bucket.add(t.eventName);
    }
    return new Map(
      Array.from(out.entries()).map(([k, v]) => [k, Array.from(v)]),
    );
  }

  /**
   * Builds all State instances using a depth-first, leaf-first traversal so
   * that every Transition.getTargetState() reference points to the exact same
   * State object that ends up in the final Process state map.
   *
   * For acyclic graphs every target state is fully constructed before the
   * transition that points to it is created, so identity holds automatically.
   *
   * For graphs that contain cycles, the algorithm detects the in-progress
   * state (cycle member), inserts a placeholder stub, completes the rest of
   * the DFS, and then rebuilds transitions for the cyclic states in a second
   * sweep — which is the classic three-pass approach, but limited to states
   * that are part of an actual cycle.
   */
  private buildStatesLeafFirst(
    eventNamesByState: Map<string, string[]>,
  ): Map<string, StateInterface> {
    const built = new Map<string, StateInterface>();
    const inProgress = new Set<string>(); // cycle detection
    const dedupSeen = new Set<string>();

    const buildState = (name: string): StateInterface => {
      if (built.has(name)) return built.get(name)!;

      // Cycle detected: create a stub and return it; the cycle will be
      // resolved in the second sweep below.
      if (inProgress.has(name)) {
        const spec = this.stateSpecs.get(name)!;
        const stub = new State(
          INTERNAL_CONSTRUCTION_KEY,
          spec.name,
          [],
          eventNamesByState.get(spec.name) ?? [],
          spec.metadata,
        );
        built.set(name, stub);
        return stub;
      }

      inProgress.add(name);
      const spec = this.stateSpecs.get(name)!;

      // Collect outgoing transition specs for this state, deduped.
      const mySpecs = this.transitionSpecs.filter((t) => t.fromState === name);
      const transitions: TransitionInterface<TSubject>[] = [];
      for (const tSpec of mySpecs) {
        const conditionName = tSpec.condition
          ? tSpec.condition.getName()
          : null;
        const dedupKey = `${tSpec.fromState}\x00${tSpec.eventName ?? ""}\x00${tSpec.toState}\x00${conditionName ?? ""}`;
        if (dedupSeen.has(dedupKey)) continue;
        dedupSeen.add(dedupKey);

        // Build the target state recursively (leaf-first).
        const targetState = buildState(tSpec.toState);
        transitions.push(
          new Transition<TSubject>(
            INTERNAL_CONSTRUCTION_KEY,
            targetState,
            tSpec.eventName,
            tSpec.condition,
            tSpec.weight,
          ),
        );
      }

      const state = new State(
        INTERNAL_CONSTRUCTION_KEY,
        spec.name,
        transitions,
        eventNamesByState.get(spec.name) ?? [],
        spec.metadata,
      );
      built.set(name, state);
      inProgress.delete(name);
      return state;
    };

    // Build all states (the DFS will pull in reachable states recursively;
    // unreachable/orphan states are handled by iterating all specs).
    for (const name of this.stateSpecs.keys()) {
      buildState(name);
    }

    // Second sweep: fix up any states that were stubs due to cycles.
    // States involved in cycles had their stubs created early; rebuild their
    // transitions now that all states exist in `built`.
    const cycleStates = Array.from(built.keys()).filter((name) => {
      const s = built.get(name)!;
      // A stub has no transitions even though the spec has outgoing edges.
      const hasOutgoing = this.transitionSpecs.some((t) => t.fromState === name);
      return (
        hasOutgoing && Array.from(s.getTransitions()).length === 0
      );
    });

    if (cycleStates.length > 0) {
      // Rebuild transitions for cycle-affected states pointing to `built`.
      for (const name of cycleStates) {
        const spec = this.stateSpecs.get(name)!;
        const mySpecs = this.transitionSpecs.filter((t) => t.fromState === name);
        const transitions: TransitionInterface<TSubject>[] = [];
        const localSeen = new Set<string>();
        for (const tSpec of mySpecs) {
          const conditionName = tSpec.condition
            ? tSpec.condition.getName()
            : null;
          const dedupKey = `${tSpec.fromState}\x00${tSpec.eventName ?? ""}\x00${tSpec.toState}\x00${conditionName ?? ""}`;
          if (localSeen.has(dedupKey)) continue;
          localSeen.add(dedupKey);
          const targetState = built.get(tSpec.toState)!;
          transitions.push(
            new Transition<TSubject>(
              INTERNAL_CONSTRUCTION_KEY,
              targetState,
              tSpec.eventName,
              tSpec.condition,
              tSpec.weight,
            ),
          );
        }
        built.set(
          name,
          new State(
            INTERNAL_CONSTRUCTION_KEY,
            spec.name,
            transitions,
            eventNamesByState.get(spec.name) ?? [],
            spec.metadata,
          ),
        );
      }

      // For cyclic graphs, the non-cycle states that transition INTO cycle
      // states may still have their transitions pointing at the old stubs.
      // A final sweep rebuilds those too.
      const cycleStateSet = new Set(cycleStates);
      for (const name of built.keys()) {
        if (cycleStateSet.has(name)) continue;
        const s = built.get(name)!;
        let needsRebuild = false;
        for (const t of s.getTransitions()) {
          if (cycleStateSet.has(t.getTargetState().getName())) {
            needsRebuild = true;
            break;
          }
        }
        if (!needsRebuild) continue;

        const spec = this.stateSpecs.get(name)!;
        const mySpecs = this.transitionSpecs.filter(
          (t) => t.fromState === name,
        );
        const transitions: TransitionInterface<TSubject>[] = [];
        const localSeen = new Set<string>();
        for (const tSpec of mySpecs) {
          const conditionName = tSpec.condition
            ? tSpec.condition.getName()
            : null;
          const dedupKey = `${tSpec.fromState}\x00${tSpec.eventName ?? ""}\x00${tSpec.toState}\x00${conditionName ?? ""}`;
          if (localSeen.has(dedupKey)) continue;
          localSeen.add(dedupKey);
          transitions.push(
            new Transition<TSubject>(
              INTERNAL_CONSTRUCTION_KEY,
              built.get(tSpec.toState)!,
              tSpec.eventName,
              tSpec.condition,
              tSpec.weight,
            ),
          );
        }
        built.set(
          name,
          new State(
            INTERNAL_CONSTRUCTION_KEY,
            spec.name,
            transitions,
            eventNamesByState.get(spec.name) ?? [],
            spec.metadata,
          ),
        );
      }
    }

    return built;
  }

  private buildTransitionsByState(
    states: Map<string, StateInterface>,
  ): Map<string, TransitionInterface<TSubject>[]> {
    // Dedup by (fromState, eventName, toState, conditionName).
    const seen = new Set<string>();
    const out = new Map<string, TransitionInterface<TSubject>[]>();
    for (const t of this.transitionSpecs) {
      const conditionName = t.condition ? t.condition.getName() : null;
      const dedupKey = `${t.fromState}\x00${t.eventName ?? ""}\x00${t.toState}\x00${conditionName ?? ""}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const targetState = states.get(t.toState)!;
      const transition = new Transition<TSubject>(
        INTERNAL_CONSTRUCTION_KEY,
        targetState,
        t.eventName,
        t.condition,
        t.weight,
      );
      let bucket = out.get(t.fromState);
      if (!bucket) {
        bucket = [];
        out.set(t.fromState, bucket);
      }
      bucket.push(transition);
    }
    return out;
  }

  private validateOrphans(
    states: Map<string, StateInterface>,
    initialName: string,
  ): void {
    const reachable = new Set<string>();
    const queue: string[] = [initialName];
    while (queue.length > 0) {
      const name = queue.shift()!;
      if (reachable.has(name)) continue;
      reachable.add(name);
      const s = states.get(name)!;
      for (const t of s.getTransitions()) {
        queue.push(t.getTargetState().getName());
      }
    }
    const orphans: string[] = [];
    for (const name of states.keys()) {
      if (!reachable.has(name)) orphans.push(name);
    }
    if (orphans.length > 0) {
      throw new GraphValidationError(
        "orphanState",
        `Process "${this.processName}" has unreachable states: ${orphans.map((n) => `"${n}"`).join(", ")}`,
        { processName: this.processName, orphanStates: orphans },
      );
    }
  }
}
