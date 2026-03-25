import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import type { EventInterface } from "../interfaces/EventInterface.js";

export class ActiveTransitionFilter {
  static async filter(
    transitions: Iterable<TransitionInterface>,
    subject: unknown,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<TransitionInterface[]> {
    const active: TransitionInterface[] = [];
    for (const transition of transitions) {
      if (await transition.isActive(subject, context, event)) {
        active.push(transition);
      }
    }
    return active;
  }
}
