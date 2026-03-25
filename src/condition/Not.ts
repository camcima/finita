import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

export class Not implements ConditionInterface {
  private readonly condition: ConditionInterface;

  constructor(condition: ConditionInterface) {
    this.condition = condition;
  }

  getName(): string {
    return `not ( ${this.condition.getName()} )`;
  }

  async checkCondition(
    subject: unknown,
    context: Map<string, unknown>,
  ): Promise<boolean> {
    return !(await this.condition.checkCondition(subject, context));
  }
}
