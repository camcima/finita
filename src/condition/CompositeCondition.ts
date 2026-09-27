import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { MaybePromise } from "../MaybePromise.js";
import { isPromiseLike } from "../util/index.js";

export abstract class CompositeCondition<
  TSubject = unknown,
> implements ConditionInterface<TSubject> {
  protected readonly conditions: ConditionInterface<TSubject>[] = [];
  private readonly joinWord: string;

  constructor(joinWord: string, condition: ConditionInterface<TSubject>) {
    this.joinWord = joinWord;
    this.conditions.push(condition);
  }

  protected addCondition(condition: ConditionInterface<TSubject>): this {
    this.conditions.push(condition);
    return this;
  }

  getName(): string {
    const names = this.conditions.map((c) => c.getName());
    return `(${names.join(` ${this.joinWord} `)})`;
  }

  abstract checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): MaybePromise<boolean>;

  /**
   * Evaluates children in order, stopping at the first whose result equals
   * `shortCircuitOn`. A child that returns a plain boolean is consumed
   * synchronously; only a returned promise is awaited. Awaiting plain values
   * would yield between children and end the machine's synchronous
   * re-entrancy guard, so a re-entrant later child would deadlock instead of
   * throwing ReentrancyError. For the same reason the composite itself
   * returns a plain boolean when every child it evaluated did.
   */
  protected evaluate(
    subject: TSubject,
    context: Map<string, unknown>,
    shortCircuitOn: boolean,
  ): MaybePromise<boolean> {
    const from = (start: number): MaybePromise<boolean> => {
      for (let i = start; i < this.conditions.length; i++) {
        const result = this.conditions[i]!.checkCondition(subject, context);
        if (isPromiseLike<boolean>(result)) {
          return Promise.resolve(result).then((value) =>
            Boolean(value) === shortCircuitOn ? shortCircuitOn : from(i + 1),
          );
        }
        if (Boolean(result) === shortCircuitOn) return shortCircuitOn;
      }
      return !shortCircuitOn;
    };
    return from(0);
  }
}
