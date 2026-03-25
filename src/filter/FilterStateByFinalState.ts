import type { StateInterface } from "../interfaces/StateInterface.js";

export class FilterStateByFinalState {
  static *filter(states: Iterable<StateInterface>): Iterable<StateInterface> {
    for (const state of states) {
      let count = 0;
      for (const _transition of state.getTransitions()) {
        count++;
        break;
      }
      if (count === 0) {
        yield state;
      }
    }
  }
}
