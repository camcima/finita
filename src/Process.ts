import type { ProcessInterface } from "./interfaces/ProcessInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import { StateCollection } from "./StateCollection.js";
import { DuplicateStateError } from "./error/DuplicateStateError.js";

export class Process implements ProcessInterface {
  private readonly name: string;
  private readonly initialState: StateInterface;
  private readonly states: StateCollection;

  constructor(name: string, initialState: StateInterface) {
    this.name = name;
    this.initialState = initialState;
    this.states = new StateCollection();
    this.registerState(initialState);
  }

  private registerState(state: StateInterface): void {
    const name = state.getName();
    if (this.states.hasState(name)) {
      if (this.states.getState(name) !== state) {
        throw new DuplicateStateError(name);
      }
      return;
    }
    this.states.addState(state);
    for (const transition of state.getTransitions()) {
      const targetState = (transition as TransitionInterface).getTargetState();
      this.registerState(targetState);
    }
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
