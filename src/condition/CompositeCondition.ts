import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

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
  ): Promise<boolean>;
}
