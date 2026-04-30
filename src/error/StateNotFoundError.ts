import { FinitaError } from "./FinitaError.js";

export class StateNotFoundError extends FinitaError {
  readonly code = "stateNotFound";
  readonly stateName: string;
  readonly availableStates: readonly string[];

  constructor(stateName: string, availableStates: Iterable<string>) {
    const list = Array.from(availableStates);
    const display =
      list.length > 0 ? list.map((n) => `"${n}"`).join(", ") : "(none)";
    super(`State "${stateName}" not found. Available: ${display}`);
    this.name = "StateNotFoundError";
    this.stateName = stateName;
    this.availableStates = Object.freeze([...list]);
  }
}
