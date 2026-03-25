import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";

export class OneOrNoneActiveTransition implements TransitionSelectorInterface {
  selectTransition(
    transitions: Iterable<TransitionInterface>,
  ): TransitionInterface | null {
    const arr = Array.from(transitions);
    switch (arr.length) {
      case 0:
        return null;
      case 1:
        return arr[0];
      default:
        throw new Error("More than one transition is active!");
    }
  }
}
