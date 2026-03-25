import type { StateInterface } from "../interfaces/StateInterface.js";

/**
 * Filters states that have at least one automatic transition (no event name).
 */
export class FilterStateByTransition {
  static *filter(states: Iterable<StateInterface>): Iterable<StateInterface> {
    for (const state of states) {
      for (const transition of state.getTransitions()) {
        if (!transition.getEventName()) {
          yield state;
          break;
        }
      }
    }
  }
}
