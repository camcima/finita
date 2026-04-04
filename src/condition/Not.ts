import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

export class Not<TSubject = unknown> implements ConditionInterface<TSubject> {
  private readonly condition: ConditionInterface<TSubject>;

  constructor(condition: ConditionInterface<TSubject>) {
    this.condition = condition;
  }

  getName(): string {
    return `not ( ${this.condition.getName()} )`;
  }

  async checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): Promise<boolean> {
    return !(await this.condition.checkCondition(subject, context));
  }
}
