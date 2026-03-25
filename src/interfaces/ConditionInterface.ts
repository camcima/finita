import type { Named } from "./Named.js";
import type { MaybePromise } from "../MaybePromise.js";

export interface ConditionInterface extends Named {
  checkCondition(
    subject: unknown,
    context: Map<string, unknown>,
  ): MaybePromise<boolean>;
}
