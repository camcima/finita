import type { TransitionInterface } from "./TransitionInterface.js";

export interface TransitionSelectorInterface<TSubject = unknown> {
  selectTransition(
    transitions: Iterable<TransitionInterface<TSubject>>,
  ): TransitionInterface<TSubject> | null;
}
