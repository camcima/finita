import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { MaybePromise } from "../MaybePromise.js";
import { isPromiseLike } from "../util/index.js";

export class Not<TSubject = unknown> implements ConditionInterface<TSubject> {
  private readonly condition: ConditionInterface<TSubject>;

  constructor(condition: ConditionInterface<TSubject>) {
    this.condition = condition;
  }

  getName(): string {
    return `not ( ${this.condition.getName()} )`;
  }

  /** Stays synchronous for a synchronous child — see CompositeCondition. */
  checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): MaybePromise<boolean> {
    const result = this.condition.checkCondition(subject, context);
    if (isPromiseLike<boolean>(result)) {
      return Promise.resolve(result).then((value) => !value);
    }
    return !result;
  }
}
