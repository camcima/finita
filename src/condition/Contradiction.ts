import type { ConditionInterface } from "../interfaces/ConditionInterface.js";

export class Contradiction implements ConditionInterface {
  private readonly name: string;

  constructor(name = "Contradiction") {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  checkCondition(_subject: unknown, _context: Map<string, unknown>): boolean {
    return false;
  }
}
