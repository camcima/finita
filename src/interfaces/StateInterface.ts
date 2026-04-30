import type { Named } from "./Named.js";
import type { Metadata } from "./Metadata.js";
import type { TransitionInterface } from "./TransitionInterface.js";
import type { EventInterface } from "./EventInterface.js";

export interface StateInterface extends Named, Metadata {
  getTransitions(): Iterable<TransitionInterface>;
  getEventNames(): string[];
  hasEvent(name: string): boolean;
  getEvent(name: string): EventInterface;
  getMetadataValue(key: string): unknown;
  hasMetadataValue(key: string): boolean;
  // No addTransition, no setMetadataValue, no deleteMetadataValue.
}
