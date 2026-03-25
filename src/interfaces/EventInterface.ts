import type { Named } from "./Named.js";
import type { Metadata } from "./Metadata.js";
import type { ObservableSubject } from "./Observer.js";

export interface EventInterface extends Named, Metadata, ObservableSubject {
  getInvokeArgs(): unknown[];
  invoke(...args: unknown[]): Promise<void>;
  getMetadataValue(key: string): unknown;
  setMetadataValue(key: string, value: unknown): void;
  hasMetadataValue(key: string): boolean;
  deleteMetadataValue(key: string): void;
}
