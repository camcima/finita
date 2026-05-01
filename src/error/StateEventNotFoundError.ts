import { FinitaError } from "./FinitaError.js";

export class StateEventNotFoundError extends FinitaError {
  readonly code = "stateEventNotFound";
  readonly stateName: string;
  readonly eventName: string;

  constructor(stateName: string, eventName: string) {
    super(`State "${stateName}" has no event "${eventName}"`);
    this.name = "StateEventNotFoundError";
    this.stateName = stateName;
    this.eventName = eventName;
  }
}
