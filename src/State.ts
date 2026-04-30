import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { Event } from "./Event.js";

export class State implements StateInterface {
  private readonly name: string;
  private readonly transitions: ReadonlySet<TransitionInterface>;
  private readonly events: ReadonlyMap<string, EventInterface>;
  private readonly metadata: ReadonlyMap<string, unknown>;

  constructor(
    key: InternalConstructionKey,
    name: string,
    transitions: Iterable<TransitionInterface>,
    eventNames: Iterable<string>,
    metadata: ReadonlyMap<string, unknown>,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error("State is not user-constructible; use ProcessBuilder.");
    }
    this.name = name;
    this.transitions = new Set(transitions);
    const events = new Map<string, EventInterface>();
    for (const en of eventNames) {
      events.set(en, new Event(en));
    }
    this.events = events;
    this.metadata = new Map(metadata);
  }

  getName(): string {
    return this.name;
  }

  getTransitions(): Iterable<TransitionInterface> {
    return this.transitions;
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
      throw new Error(`State "${this.name}" has no event "${name}"`);
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
