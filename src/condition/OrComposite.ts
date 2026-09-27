import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { MaybePromise } from "../MaybePromise.js";
import { CompositeCondition } from "./CompositeCondition.js";

export class OrComposite<
  TSubject = unknown,
> extends CompositeCondition<TSubject> {
  constructor(condition: ConditionInterface<TSubject>) {
    super("or", condition);
  }

  addOr(condition: ConditionInterface<TSubject>): this {
    return this.addCondition(condition);
  }

  checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): MaybePromise<boolean> {
    return this.evaluate(subject, context, true);
  }
}
