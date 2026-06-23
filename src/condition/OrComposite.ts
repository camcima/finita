import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
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

  async checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): Promise<boolean> {
    for (const condition of this.conditions) {
      if (await condition.checkCondition(subject, context)) {
        return true;
      }
    }
    return false;
  }
}
