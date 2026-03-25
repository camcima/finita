import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import type { EventInterface } from "../interfaces/EventInterface.js";

export class ActiveTransitionFilter {
  static async filter<TSubject = unknown>(
    transitions: Iterable<TransitionInterface<TSubject>>,
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<TransitionInterface<TSubject>[]> {
    const active: TransitionInterface<TSubject>[] = [];
    for (const transition of transitions) {
      if (await transition.isActive(subject, context, event)) {
        active.push(transition);
      }
    }
    return active;
  }
}
