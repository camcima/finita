import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import { OneOrNoneActiveTransition } from "./OneOrNoneActiveTransition.js";

export class WeightTransition<
  TSubject = unknown,
> implements TransitionSelectorInterface<TSubject> {
  private readonly innerSelector: TransitionSelectorInterface<TSubject>;
  private readonly epsilon: number;

  constructor(
    innerSelector?: TransitionSelectorInterface<TSubject>,
    epsilon = 0.001,
  ) {
    this.innerSelector =
      innerSelector ?? new OneOrNoneActiveTransition<TSubject>();
    this.epsilon = epsilon;
  }

  selectTransition(
    transitions: Iterable<TransitionInterface<TSubject>>,
  ): TransitionInterface<TSubject> | null {
    let bestTransitions: TransitionInterface<TSubject>[] = [];
    let bestWeight: number | null = null;
    for (const transition of transitions) {
      const weight = transition.getWeight();
      const diff = weight - (bestWeight ?? 0);
      if (bestWeight === null || diff >= this.epsilon) {
        bestWeight = weight;
        bestTransitions = [transition];
      } else if (Math.abs(diff) < this.epsilon) {
        bestTransitions.push(transition);
      }
    }
    return this.innerSelector.selectTransition(bestTransitions);
  }
}
