import type { Named } from "./Named.js";
import type { MaybePromise } from "../MaybePromise.js";

export interface ConditionInterface<TSubject = unknown> extends Named {
  checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): MaybePromise<boolean>;
}
