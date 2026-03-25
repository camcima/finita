import type { StateCollectionInterface } from "./interfaces/StateCollectionInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import { StateCollectionMerger } from "./util/StateCollectionMerger.js";
import { DuplicateStateError } from "./error/DuplicateStateError.js";

export class StateCollection implements StateCollectionInterface {
  private readonly states: Map<string, StateInterface> = new Map();
  private stateCollectionMerger: StateCollectionMerger | null = null;

  getState(name: string): StateInterface {
    const state = this.states.get(name);
    if (!state) {
      throw new Error(`State "${name}" not found`);
    }
    return state;
  }

  getStates(): Iterable<StateInterface> {
    return this.states.values();
  }

  hasState(name: string): boolean {
    return this.states.has(name);
  }

  addState(state: StateInterface): void {
    const existing = this.states.get(state.getName());
    if (existing && existing !== state) {
      throw new DuplicateStateError(state.getName());
    }
    this.states.set(state.getName(), state);
  }

  getStateCollectionMerger(): StateCollectionMerger {
    if (!this.stateCollectionMerger) {
      this.stateCollectionMerger = new StateCollectionMerger(this);
    }
    return this.stateCollectionMerger;
  }

  merge(source: StateCollectionInterface): void {
    const merger = this.getStateCollectionMerger();
    merger.merge(source);
  }
}
