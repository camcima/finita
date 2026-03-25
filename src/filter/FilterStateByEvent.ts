import type { StateInterface } from "../interfaces/StateInterface.js";

export class FilterStateByEvent {
  static *filter(
    states: Iterable<StateInterface>,
    eventName: string,
  ): Iterable<StateInterface> {
    for (const state of states) {
      if (state.hasEvent(eventName)) {
        yield state;
      }
    }
  }
}
