import { FinitaError } from "./FinitaError.js";

export class DuplicateStateError extends FinitaError {
  readonly code = "duplicateState";
  readonly stateName: string;

  constructor(stateName: string) {
    super(
      `There is already a different state with name "${stateName}" in this collection`,
    );
    this.name = "DuplicateStateError";
    this.stateName = stateName;
  }
}
