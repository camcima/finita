import type { Named } from "./Named.js";
import type { Metadata } from "./Metadata.js";
import type { TransitionInterface } from "./TransitionInterface.js";
import type { EventInterface } from "./EventInterface.js";

export interface StateInterface extends Named, Metadata {
  getTransitions(): Iterable<TransitionInterface>;
  addTransition(transition: TransitionInterface): void;
  getEventNames(): string[];
  hasEvent(name: string): boolean;
  getEvent(name: string): EventInterface;
  getMetadataValue(key: string): unknown;
  setMetadataValue(key: string, value: unknown): void;
  hasMetadataValue(key: string): boolean;
  deleteMetadataValue(key: string): void;
}
