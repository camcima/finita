import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import { Event } from "./Event.js";

export class State implements StateInterface {
  private readonly name: string;
  private readonly transitions: Set<TransitionInterface> = new Set();
  private readonly events: Map<string, EventInterface> = new Map();
  private readonly metadata: Map<string, unknown> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getTransitions(): Iterable<TransitionInterface> {
    return this.transitions;
  }

  addTransition(transition: TransitionInterface): void {
    if (this.transitions.has(transition)) {
      return;
    }
    const targetName = transition.getTargetState().getName();
    const eventName = transition.getEventName();
    const conditionName = transition.getConditionName();
    for (const existing of this.transitions) {
      if (
        existing.getTargetState().getName() === targetName &&
        existing.getEventName() === eventName &&
        existing.getConditionName() === conditionName
      ) {
        return;
      }
    }
    this.transitions.add(transition);
    if (eventName) {
      this.getEvent(eventName);
    }
  }

  getEventNames(): string[] {
    return Array.from(this.events.keys());
  }

  hasEvent(name: string): boolean {
    return this.events.has(name);
  }

  getEvent(name: string): EventInterface {
    let event = this.events.get(name);
    if (!event) {
      event = new Event(name);
      this.events.set(name, event);
    }
    return event;
  }

  getMetadata(): Record<string, unknown> {
    return Object.fromEntries(this.metadata);
  }

  getMetadataValue(key: string): unknown {
    return this.metadata.get(key);
  }

  setMetadataValue(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  hasMetadataValue(key: string): boolean {
    return this.metadata.has(key);
  }

  deleteMetadataValue(key: string): void {
    this.metadata.delete(key);
  }
}
