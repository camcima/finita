import type { ProcessInterface } from "./interfaces/ProcessInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";
import { StateCollection } from "./StateCollection.js";

export class Process implements ProcessInterface {
  private readonly name: string;
  private readonly initialState: StateInterface;
  private readonly states: StateCollection;

  constructor(
    key: InternalConstructionKey,
    name: string,
    initialState: StateInterface,
    states: Iterable<StateInterface>,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error("Process is not user-constructible; use ProcessBuilder.");
    }
    this.name = name;
    this.initialState = initialState;
    this.states = new StateCollection(states);
    Object.freeze(this);
  }

  getName(): string {
    return this.name;
  }

  getInitialState(): StateInterface {
    return this.initialState;
  }

  getStates(): Iterable<StateInterface> {
    return this.states.getStates();
  }

  getState(name: string): StateInterface {
    return this.states.getState(name);
  }

  hasState(name: string): boolean {
    return this.states.hasState(name);
  }
}
