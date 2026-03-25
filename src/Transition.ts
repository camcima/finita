import type { TransitionInterface } from "./interfaces/TransitionInterface.js";
import type { StateInterface } from "./interfaces/StateInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";
import type { ConditionInterface } from "./interfaces/ConditionInterface.js";

export class Transition<TSubject = unknown>
  implements TransitionInterface<TSubject>
{
  private readonly targetState: StateInterface;
  private readonly eventName: string | null;
  private readonly condition: ConditionInterface<TSubject> | null;
  private weight: number = 1;

  constructor(
    targetState: StateInterface,
    eventName: string | null = null,
    condition: ConditionInterface<TSubject> | null = null,
  ) {
    this.targetState = targetState;
    this.eventName = eventName;
    this.condition = condition;
  }

  getTargetState(): StateInterface {
    return this.targetState;
  }

  getEventName(): string | null {
    return this.eventName;
  }

  getConditionName(): string | null {
    if (this.condition) {
      return this.condition.getName();
    }
    return null;
  }

  getCondition(): ConditionInterface<TSubject> | null {
    return this.condition;
  }

  async isActive(
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<boolean> {
    let result: boolean;
    if (event) {
      result = event.getName() === this.eventName;
    } else {
      result = this.eventName === null;
    }
    if (this.condition && result) {
      result = await this.condition.checkCondition(subject, context);
    }
    return result;
  }

  getWeight(): number {
    return this.weight;
  }

  setWeight(weight: number): void {
    this.weight = weight;
  }
}
