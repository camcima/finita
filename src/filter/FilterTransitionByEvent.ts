import type { TransitionInterface } from "../interfaces/TransitionInterface.js";

export class FilterTransitionByEvent {
  static *filter(
    transitions: Iterable<TransitionInterface>,
    eventName: string,
  ): Iterable<TransitionInterface> {
    for (const transition of transitions) {
      if (transition.getEventName() === eventName) {
        yield transition;
      }
    }
  }
}
