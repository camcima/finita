import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

export type ConditionCallbackFn = (
  subject: unknown,
  context: Map<string, unknown>,
) => MaybePromise<boolean>;

export class CallbackCondition implements ConditionInterface {
  private readonly name: string;
  private readonly callable: ConditionCallbackFn;

  constructor(name: string, callable: ConditionCallbackFn) {
    this.name = name;
    this.callable = callable;
  }

  getName(): string {
    return this.name;
  }

  checkCondition(
    subject: unknown,
    context: Map<string, unknown>,
  ): MaybePromise<boolean> {
    return this.callable(subject, context);
  }
}
