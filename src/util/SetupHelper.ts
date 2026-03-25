import type { StateInterface } from "../interfaces/StateInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import type { EventInterface } from "../interfaces/EventInterface.js";
import type { Observer } from "../interfaces/Observer.js";
import { State } from "../State.js";
import { Transition } from "../Transition.js";
import { StateCollection } from "../StateCollection.js";

export class SetupHelper {
  protected readonly stateCollection: StateCollection;

  constructor(stateCollection: StateCollection) {
    this.stateCollection = stateCollection;
  }

  findOrCreateState(name: string): StateInterface {
    if (!this.stateCollection.hasState(name)) {
      this.stateCollection.addState(new State(name));
    }
    return this.stateCollection.getState(name);
  }

  protected findTransition(
    sourceState: StateInterface,
    targetState: StateInterface,
    eventName: string | null = null,
    condition: ConditionInterface | null = null,
  ): TransitionInterface | null {
    const conditionName = condition ? condition.getName() : null;
    for (const transition of sourceState.getTransitions()) {
      const hasSameTargetState = transition.getTargetState() === targetState;
      const hasSameCondition = transition.getConditionName() === conditionName;
      const hasSameEvent = transition.getEventName() === eventName;
      if (hasSameTargetState && hasSameCondition && hasSameEvent) {
        return transition;
      }
    }
    return null;
  }

  findOrCreateTransition(
    sourceStateName: string,
    targetStateName: string,
    eventName: string | null = null,
    condition: ConditionInterface | null = null,
  ): TransitionInterface {
    const sourceState = this.findOrCreateState(sourceStateName);
    const targetState = this.findOrCreateState(targetStateName);
    let transition = this.findTransition(
      sourceState,
      targetState,
      eventName,
      condition,
    );
    if (!transition) {
      transition = new Transition(targetState, eventName, condition);
      sourceState.addTransition(transition);
    }
    return transition;
  }

  findOrCreateEvent(
    sourceStateName: string,
    eventName: string,
  ): EventInterface {
    const sourceState = this.findOrCreateState(sourceStateName);
    return sourceState.getEvent(eventName);
  }

  addCommand(
    sourceStateName: string,
    eventName: string,
    command: Observer,
  ): void {
    this.findOrCreateEvent(sourceStateName, eventName).attach(command);
  }

  addCommandAndSelfTransition(
    sourceStateName: string,
    eventName: string,
    command: Observer,
  ): void {
    this.addCommand(sourceStateName, eventName, command);
    this.findOrCreateTransition(sourceStateName, sourceStateName, eventName);
  }
}
