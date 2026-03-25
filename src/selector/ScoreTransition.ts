import type { TransitionSelectorInterface } from "../interfaces/TransitionSelectorInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import { OneOrNoneActiveTransition } from "./OneOrNoneActiveTransition.js";

export class ScoreTransition implements TransitionSelectorInterface {
  private readonly innerSelector: TransitionSelectorInterface;

  constructor(innerSelector?: TransitionSelectorInterface) {
    this.innerSelector = innerSelector ?? new OneOrNoneActiveTransition();
  }

  protected calculateScore(transition: TransitionInterface): number {
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
    transitions: Iterable<TransitionInterface>,
  ): TransitionInterface | null {
    let bestTransitions: TransitionInterface[] = [];
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
