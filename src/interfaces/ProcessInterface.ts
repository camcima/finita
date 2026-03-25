import type { Named } from "./Named.js";
import type { StateCollectionInterface } from "./StateCollectionInterface.js";
import type { StateInterface } from "./StateInterface.js";

export interface ProcessInterface extends Named, StateCollectionInterface {
  getInitialState(): StateInterface;
}
