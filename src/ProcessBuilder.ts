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
    this.validateName("invalidStateName", name, `addState("${name}")`, {
      stateName: name,
    });
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
      this.validateName(
        "invalidEventName",
        options.event,
        `addTransition called with an invalid event name from "${fromState}" to "${toState}"`,
        { fromState, toState, eventName: options.event },
      );
      eventName = options.event;
    }
    if (options.condition) {
      const conditionName = options.condition.getName();
      this.validateName(
        "invalidConditionName",
        conditionName,
        `addTransition called with an invalid condition name from "${fromState}" to "${toState}"`,
        { fromState, toState, conditionName },
      );
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

    // Two-phase construction: create all State instances first (with no
    // transitions), then build Transitions targeting those instances and attach
    // them. Identity holds by construction for any graph topology.
    const finalStates = this.buildAllStates(eventNamesByState);

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

  /** One name rule for every named entity: non-empty, no leading/trailing whitespace. */
  private validateName(
    code: "invalidStateName" | "invalidEventName" | "invalidConditionName",
    raw: string,
    description: string,
    details: Record<string, unknown>,
  ): void {
    if (raw.trim() === "" || raw !== raw.trim()) {
      throw new GraphValidationError(
        code,
        `${description}: name ${JSON.stringify(raw)} is empty or whitespace-padded`,
        details,
      );
    }
  }

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

  /** Transition identity: (fromState, eventName, toState). Used by both the
   *  conflict check and the build-time dedup — keep them in lockstep. */
  private static transitionKey(t: {
    fromState: string;
    eventName: string | null;
    toState: string;
  }): string {
    return `${t.fromState}\x00${t.eventName ?? ""}\x00${t.toState}`;
  }

  private validateNoConflictingDuplicates(): void {
    // Identity key: (fromState, eventName, toState).
    // Same condition reference AND same weight → dedup (idempotent
    // re-declaration). Anything else → conflict. We cannot introspect
    // callable bodies to compare logic, so different object identity is
    // treated as different logic.
    const seen = new Map<string, TransitionSpec<TSubject>>();
    for (const t of this.transitionSpecs) {
      const key = ProcessBuilder.transitionKey(t);
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, t);
        continue;
      }
      if (existing.condition !== t.condition || existing.weight !== t.weight) {
        throw new DuplicateTransitionError({
          fromState: t.fromState,
          toState: t.toState,
          eventName: t.eventName,
          existingConditionName: existing.condition
            ? existing.condition.getName()
            : null,
          newConditionName: t.condition ? t.condition.getName() : null,
          existingWeight: existing.weight,
          newWeight: t.weight,
        });
      }
      // Same identity, same condition instance, same weight → dedup silently.
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
   * Two-phase construction:
   * Phase 1 — create all final State instances with no transitions.
   * Phase 2 — build Transitions targeting the Phase-1 States, then attach
   *            them via State._initTransitions.
   *
   * Because every Transition is created after every State exists, target
   * identity holds by construction for any graph topology (acyclic, cyclic,
   * self-loop).
   */
  private buildAllStates(
    eventNamesByState: Map<string, string[]>,
  ): Map<string, StateInterface> {
    const built = new Map<string, StateInterface>();

    // Phase 1: create all States with no transitions.
    for (const spec of this.stateSpecs.values()) {
      built.set(
        spec.name,
        new State(
          INTERNAL_CONSTRUCTION_KEY,
          spec.name,
          eventNamesByState.get(spec.name) ?? [],
          spec.metadata,
        ),
      );
    }

    // Phase 2: build Transitions targeting Phase-1 States, then attach.
    // validateNoConflictingDuplicates already guaranteed that specs sharing
    // the identity key are exact duplicates, so a plain key dedup suffices.
    const dedupSeen = new Set<string>();
    const transitionsByState = new Map<
      string,
      TransitionInterface<TSubject>[]
    >();
    for (const spec of this.stateSpecs.values()) {
      transitionsByState.set(spec.name, []);
    }
    for (const tSpec of this.transitionSpecs) {
      const dedupKey = ProcessBuilder.transitionKey(tSpec);
      if (dedupSeen.has(dedupKey)) continue;
      dedupSeen.add(dedupKey);
      const targetState = built.get(tSpec.toState)!;
      const transition = new Transition<TSubject>(
        INTERNAL_CONSTRUCTION_KEY,
        targetState,
        tSpec.eventName,
        tSpec.condition,
        tSpec.weight,
      );
      transitionsByState.get(tSpec.fromState)!.push(transition);
    }

    for (const [name, transitions] of transitionsByState) {
      (built.get(name) as State)._initTransitions(
        INTERNAL_CONSTRUCTION_KEY,
        transitions,
      );
    }

    return built;
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
