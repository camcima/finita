import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

export class AndComposite implements ConditionInterface {
  private readonly conditions: ConditionInterface[] = [];

  constructor(condition: ConditionInterface) {
    this.conditions.push(condition);
  }

  addAnd(condition: ConditionInterface): this {
    this.conditions.push(condition);
    return this;
  }

  getName(): string {
    const names = this.conditions.map((c) => c.getName());
    return `(${names.join(" and ")})`;
  }

  async checkCondition(
    subject: unknown,
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
