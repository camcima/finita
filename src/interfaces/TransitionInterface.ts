import type { Weighted } from "./Weighted.js";
import type { StateInterface } from "./StateInterface.js";
import type { EventInterface } from "./EventInterface.js";
import type { ConditionInterface } from "./ConditionInterface.js";

export interface TransitionInterface<TSubject = unknown> extends Weighted {
  getTargetState(): StateInterface;
  getEventName(): string | null;
  getConditionName(): string | null;
  getCondition(): ConditionInterface<TSubject> | null;
  isActive(
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<boolean>;
}
