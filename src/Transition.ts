import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { ConditionInterface } from "./interfaces/ConditionInterface.js";
import type { InternalConstructionKey } from "./internal/InternalConstruction.js";
import { INTERNAL_CONSTRUCTION_KEY } from "./internal/InternalConstruction.js";

export class Transition<
  TSubject = unknown,
> implements TransitionInterface<TSubject> {
  private readonly targetState: StateInterface;
  private readonly eventName: string | null;
  private readonly condition: ConditionInterface<TSubject> | null;
  private readonly weight: number;

  constructor(
    key: InternalConstructionKey,
    targetState: StateInterface,
    eventName: string | null,
    condition: ConditionInterface<TSubject> | null,
    weight: number,
  ) {
    if (key !== INTERNAL_CONSTRUCTION_KEY) {
      throw new Error(
        "Transition is not user-constructible; use ProcessBuilder.",
      );
    }
    this.targetState = targetState;
    this.eventName = eventName;
    this.condition = condition;
    this.weight = weight;
  }

  getTargetState(): StateInterface {
    return this.targetState;
  }

  getEventName(): string | null {
    return this.eventName;
  }

  getConditionName(): string | null {
    return this.condition ? this.condition.getName() : null;
  }

  getCondition(): ConditionInterface<TSubject> | null {
    return this.condition;
  }

  async isActive(
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<boolean> {
    let active: boolean;
    if (event) {
      active = event.getName() === this.eventName;
    } else {
      active = this.eventName === null;
    }
    if (this.condition && active) {
      active = await this.condition.checkCondition(subject, context);
    }
    return active;
  }

  getWeight(): number {
    return this.weight;
  }
}
