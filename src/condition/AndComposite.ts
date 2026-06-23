import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import { CompositeCondition } from "./CompositeCondition.js";

export class AndComposite<
  TSubject = unknown,
> extends CompositeCondition<TSubject> {
  constructor(condition: ConditionInterface<TSubject>) {
    super("and", condition);
  }

  addAnd(condition: ConditionInterface<TSubject>): this {
    return this.addCondition(condition);
  }

  async checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): Promise<boolean> {
    for (const condition of this.conditions) {
      if (!(await condition.checkCondition(subject, context))) {
        return false;
      }
    }
    return true;
  }
}
