import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import type { EventInterface } from "../interfaces/EventInterface.js";

export class ActiveTransitionFilter {
  static async filter<TSubject = unknown>(
    transitions: Iterable<TransitionInterface<TSubject>>,
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
    /**
     * Optional wrapper run around each individual isActive() evaluation. The
     * Statemachine passes its re-entrancy guard here so that every condition —
     * not just the first — is evaluated with the guard active; without per-item
     * wrapping a re-entrant condition on a later transition would deadlock.
     */
    wrap?: <T>(fn: () => T) => T,
  ): Promise<TransitionInterface<TSubject>[]> {
    const run = wrap ?? (<T>(fn: () => T): T => fn());
    const active: TransitionInterface<TSubject>[] = [];
    for (const transition of transitions) {
      if (await run(() => transition.isActive(subject, context, event))) {
        active.push(transition);
      }
    }
    return active;
  }
}
