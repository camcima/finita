import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

export class AndComposite<TSubject = unknown>
  implements ConditionInterface<TSubject>
{
  private readonly conditions: ConditionInterface<TSubject>[] = [];

  constructor(condition: ConditionInterface<TSubject>) {
    this.conditions.push(condition);
  }

  addAnd(condition: ConditionInterface<TSubject>): this {
    this.conditions.push(condition);
    return this;
  }

  getName(): string {
    const names = this.conditions.map((c) => c.getName());
    return `(${names.join(" and ")})`;
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
