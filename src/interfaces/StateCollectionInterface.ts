import type { StateInterface } from "./StateInterface.js";

export interface StateCollectionInterface {
  getStates(): Iterable<StateInterface>;
  getState(name: string): StateInterface;
  hasState(name: string): boolean;
}
