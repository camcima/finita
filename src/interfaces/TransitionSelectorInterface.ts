import type { TransitionInterface } from "./TransitionInterface.js";

export interface TransitionSelectorInterface {
  selectTransition(
    transitions: Iterable<TransitionInterface>,
  ): TransitionInterface | null;
}
