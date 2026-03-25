import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

export type ConditionCallbackFn<TSubject = unknown> = (
  subject: TSubject,
  context: Map<string, unknown>,
) => MaybePromise<boolean>;

export class CallbackCondition<TSubject = unknown>
  implements ConditionInterface<TSubject>
{
  private readonly name: string;
  private readonly callable: ConditionCallbackFn<TSubject>;

  constructor(name: string, callable: ConditionCallbackFn<TSubject>) {
    this.name = name;
    this.callable = callable;
  }

  getName(): string {
    return this.name;
  }

  checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): MaybePromise<boolean> {
    return this.callable(subject, context);
  }
}
