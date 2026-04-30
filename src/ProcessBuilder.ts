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

    // Pass 1: create State instances with no transitions — these serve as
    // transition targets so that the Transition objects can reference them.
    const targetStates = new Map<string, StateInterface>();
    for (const spec of this.stateSpecs.values()) {
      const state = new State(
        INTERNAL_CONSTRUCTION_KEY,
        spec.name,
        [],
        eventNamesByState.get(spec.name) ?? [],
        spec.metadata,
      );
      targetStates.set(spec.name, state);
    }

    // Pass 2: build transitions pointing to pass-1 states, then re-create
    // each State with its transitions.
    const transitionsByState = this.buildTransitionsByState(targetStates);
    const finalStates = new Map<string, StateInterface>();
    for (const spec of this.stateSpecs.values()) {
      const state = new State(
        INTERNAL_CONSTRUCTION_KEY,
        spec.name,
        transitionsByState.get(spec.name) ?? [],
        eventNamesByState.get(spec.name) ?? [],
        spec.metadata,
      );
      finalStates.set(spec.name, state);
    }

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
