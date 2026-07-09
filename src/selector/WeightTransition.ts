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
    if (!Number.isFinite(epsilon) || epsilon <= 0) {
      throw new RangeError(
        `WeightTransition epsilon must be a finite number greater than 0; got ${String(epsilon)}`,
      );
    }
    this.innerSelector =
      innerSelector ?? new OneOrNoneActiveTransition<TSubject>();
    this.epsilon = epsilon;
  }

  selectTransition(
    transitions: Iterable<TransitionInterface<TSubject>>,
  ): TransitionInterface<TSubject> | null {
    const all = Array.from(transitions);
    let maxWeight = Number.NEGATIVE_INFINITY;
    for (const transition of all) {
      const weight = transition.getWeight();
      if (!Number.isFinite(weight)) {
        throw new RangeError(
          `WeightTransition: transition weights must be finite numbers; got ${String(weight)}`,
        );
      }
      if (weight > maxWeight) maxWeight = weight;
    }
    const best = all.filter(
      (transition) => maxWeight - transition.getWeight() < this.epsilon,
    );
    return this.innerSelector.selectTransition(best);
  }
}
