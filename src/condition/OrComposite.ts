import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

export class OrComposite implements ConditionInterface {
  private readonly conditions: ConditionInterface[] = [];

  constructor(condition: ConditionInterface) {
    this.conditions.push(condition);
  }

  addOr(condition: ConditionInterface): this {
    this.conditions.push(condition);
    return this;
  }

  getName(): string {
    const names = this.conditions.map((c) => c.getName());
    return `(${names.join(" or ")})`;
  }

  async checkCondition(
    subject: unknown,
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
