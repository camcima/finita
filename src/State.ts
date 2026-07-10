import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { Event } from "./Event.js";
import { StateEventNotFoundError } from "./error/StateEventNotFoundError.js";

export class State implements StateInterface {
  private readonly name: string;
  private _transitions: ReadonlySet<TransitionInterface> | null = null;
  private readonly events: ReadonlyMap<string, EventInterface>;
  private readonly metadata: ReadonlyMap<string, unknown>;

  constructor(
    key: InternalConstructionKey,
    name: string,
    eventNames: Iterable<string>,
    metadata: ReadonlyMap<string, unknown>,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error("State is not user-constructible; use ProcessBuilder.");
    }
    this.name = name;
    const events = new Map<string, EventInterface>();
    for (const en of eventNames) {
      events.set(en, new Event(en));
    }
    this.events = events;
    this.metadata = new Map(metadata);
  }

  /**
   * Internal: populate transitions after State construction.
   * May only be called once and only with the construction key.
   * Used by ProcessBuilder to break the cycle: State must exist before
   * Transitions can target it, but State needs its transitions to be useful.
   */
  _initTransitions(
    key: InternalConstructionKey,
    transitions: Iterable<TransitionInterface>,
  ): void {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error("_initTransitions is internal");
    }
    if (this._transitions !== null) {
      throw new Error(`State "${this.name}" transitions already set`);
    }
    this._transitions = new Set(transitions);
    Object.freeze(this);
  }

  getName(): string {
    return this.name;
  }

  getTransitions(): Iterable<TransitionInterface> {
    if (this._transitions === null) {
      return [];
    }
    return this._transitions;
  }

  getEventNames(): string[] {
    return Array.from(this.events.keys());
  }

  hasEvent(name: string): boolean {
    return this.events.has(name);
  }

  getEvent(name: string): EventInterface {
    const event = this.events.get(name);
    if (!event) {
      throw new StateEventNotFoundError(this.name, name);
    }
    return event;
  }

  getMetadata(): Record<string, unknown> {
    return Object.fromEntries(this.metadata);
  }

  getMetadataValue(key: string): unknown {
    return this.metadata.get(key);
  }

  hasMetadataValue(key: string): boolean {
    return this.metadata.has(key);
  }
}
