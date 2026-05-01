import type { StateCollectionInterface } from "./interfaces/StateCollectionInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import { StateNotFoundError } from "./error/StateNotFoundError.js";

export class StateCollection implements StateCollectionInterface {
  private readonly states: ReadonlyMap<string, StateInterface>;

  constructor(states: Iterable<StateInterface>) {
    const map = new Map<string, StateInterface>();
    for (const s of states) {
      map.set(s.getName(), s);
    }
    this.states = map;
  }

  getStates(): Iterable<StateInterface> {
    return this.states.values();
  }

  getState(name: string): StateInterface {
    const s = this.states.get(name);
    if (!s) {
      throw new StateNotFoundError(name, this.states.keys());
    }
    return s;
  }

  hasState(name: string): boolean {
    return this.states.has(name);
  }
}
