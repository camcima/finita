import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { LastStateHasChangedDateInterface } from "../interfaces/LastStateHasChangedDateInterface.js";

function isLastStateHasChangedDate(
  obj: unknown,
): obj is LastStateHasChangedDateInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getLastStateHasChangedDate" in obj &&
    typeof (obj as LastStateHasChangedDateInterface)
      .getLastStateHasChangedDate === "function"
  );
}

export class Timeout implements ConditionInterface {
  private readonly timeoutMs: number;
  private readonly label: string;

  constructor(timeoutMs: number, label?: string) {
    this.timeoutMs = timeoutMs;
    this.label = label ?? `${timeoutMs}ms`;
  }

  getName(): string {
    return `Timeout: ${this.label}`;
  }

  protected getLastStateHasChangedDate(
    subject: unknown,
    _context: Map<string, unknown>,
  ): Date {
    if (isLastStateHasChangedDate(subject)) {
      return subject.getLastStateHasChangedDate();
    }
    throw new Error("Subject must implement LastStateHasChangedDateInterface");
  }

  checkCondition(subject: unknown, context: Map<string, unknown>): boolean {
    const date = new Date(
      this.getLastStateHasChangedDate(subject, context).getTime(),
    );
    date.setTime(date.getTime() + this.timeoutMs);
    return date <= new Date();
  }
}
