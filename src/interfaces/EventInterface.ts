import type { Named } from "./Named.js";
import type { Metadata } from "./Metadata.js";
import type { ObservableSubject } from "./Observer.js";

export interface EventInterface extends Named, Metadata, ObservableSubject {
  /**
   * @deprecated Always returns []. Invoke args are now passed directly to
   * Observer.update — reading them from the event was racy when one
   * Process served multiple Statemachines.
   */
  getInvokeArgs(): unknown[];
  invoke(...args: unknown[]): Promise<void>;
  getMetadataValue(key: string): unknown;
  setMetadataValue(key: string, value: unknown): void;
  hasMetadataValue(key: string): boolean;
  deleteMetadataValue(key: string): void;
}
