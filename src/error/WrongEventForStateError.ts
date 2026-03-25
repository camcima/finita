export class WrongEventForStateError extends Error {
  readonly stateName: string;
  readonly eventName: string;

  constructor(stateName: string, eventName: string) {
    super(`Current state "${stateName}" doesn't have event "${eventName}"`);
    this.name = "WrongEventForStateError";
    this.stateName = stateName;
    this.eventName = eventName;
  }
}
