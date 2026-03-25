import type { StateCollectionInterface } from "../interfaces/StateCollectionInterface.js";
import type { StateInterface } from "../interfaces/StateInterface.js";
import type { TransitionInterface } from "../interfaces/TransitionInterface.js";
import type { ConditionInterface } from "../interfaces/ConditionInterface.js";
import { State } from "../State.js";
import { Transition } from "../Transition.js";
import { StateCollection } from "../StateCollection.js";

export class StateCollectionMerger {
  private readonly targetCollection: StateCollection;
  private stateNamePrefix = "";

  constructor(targetCollection: StateCollection) {
    this.targetCollection = targetCollection;
  }

  getStateNamePrefix(): string {
    return this.stateNamePrefix;
  }

  setStateNamePrefix(prefix: string): void {
    this.stateNamePrefix = prefix;
  }

  getTargetCollection(): StateCollection {
    return this.targetCollection;
  }

  protected createState(name: string): StateInterface {
    return new State(name);
  }

  protected findOrCreateState(name: string): StateInterface {
    const prefixedName = this.stateNamePrefix + name;
    if (this.targetCollection.hasState(prefixedName)) {
      return this.targetCollection.getState(prefixedName);
    }
    const state = this.createState(prefixedName);
    this.targetCollection.addState(state);
    return state;
  }

  protected createCondition(
    sourceTransition: TransitionInterface,
  ): ConditionInterface | null {
    return sourceTransition.getCondition();
  }

  protected createTransition(
    sourceTransition: TransitionInterface,
  ): Transition {
    const targetStateName = sourceTransition.getTargetState().getName();
    const targetState = this.findOrCreateState(targetStateName);
    this.mergeMetadata(sourceTransition.getTargetState(), targetState);
    const eventName = sourceTransition.getEventName();
    const condition = this.createCondition(sourceTransition);
    const transition = new Transition(targetState, eventName, condition);
    transition.setWeight(sourceTransition.getWeight());
    return transition;
  }

  protected mergeMetadata(
    source: StateInterface,
    target: StateInterface,
  ): void {
    const metadata = source.getMetadata();
    for (const [key, value] of Object.entries(metadata)) {
      target.setMetadataValue(key, value);
    }
  }

  protected mergeEvent(
    source: StateInterface,
    target: StateInterface,
    eventName: string,
  ): void {
    const sourceEvent = source.getEvent(eventName);
    const targetEvent = target.getEvent(eventName);

    const sourceMetadata = sourceEvent.getMetadata();
    for (const [key, value] of Object.entries(sourceMetadata)) {
      targetEvent.setMetadataValue(key, value);
    }

    for (const observer of sourceEvent.getObservers()) {
      targetEvent.attach(observer);
    }
  }

  protected mergeState(sourceState: StateInterface): void {
    const targetState = this.findOrCreateState(sourceState.getName());
    this.mergeMetadata(sourceState, targetState);

    for (const sourceTransition of sourceState.getTransitions()) {
      const targetTransition = this.createTransition(sourceTransition);
      targetState.addTransition(targetTransition);
    }

    for (const eventName of sourceState.getEventNames()) {
      this.mergeEvent(sourceState, targetState, eventName);
    }
  }

  merge(source: StateCollectionInterface | StateInterface): void {
    if ("getStates" in source && typeof source.getStates === "function") {
      const collection = source as StateCollectionInterface;
      for (const state of collection.getStates()) {
        this.mergeState(state);
      }
    } else {
      this.mergeState(source as StateInterface);
    }
  }
}
