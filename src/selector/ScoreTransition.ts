import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import { OneOrNoneActiveTransition } from "./OneOrNoneActiveTransition.js";

export class ScoreTransition<TSubject = unknown>
  implements TransitionSelectorInterface<TSubject>
{
  private readonly innerSelector: TransitionSelectorInterface<TSubject>;

  constructor(innerSelector?: TransitionSelectorInterface<TSubject>) {
    this.innerSelector =
      innerSelector ?? new OneOrNoneActiveTransition<TSubject>();
  }

  protected calculateScore(
    transition: TransitionInterface<TSubject>,
  ): number {
    let score = 0;
    if (transition.getEventName()) {
      score += 2;
    }
    if (transition.getConditionName()) {
      score += 1;
    }
    return score;
  }

  selectTransition(
    transitions: Iterable<TransitionInterface<TSubject>>,
  ): TransitionInterface<TSubject> | null {
    let bestTransitions: TransitionInterface<TSubject>[] = [];
    let bestScore = -1;
    for (const transition of transitions) {
      const score = this.calculateScore(transition);
      if (score > bestScore) {
        bestScore = score;
        bestTransitions = [transition];
      } else if (score === bestScore) {
        bestTransitions.push(transition);
      }
    }
    return this.innerSelector.selectTransition(bestTransitions);
  }
}
