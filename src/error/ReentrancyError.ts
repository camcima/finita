import { FinitaError } from "./FinitaError.js";

export class ReentrancyError extends FinitaError {
  readonly code = "reentrancy";

  constructor(operation: string) {
    super(
      `${operation} was called from inside an observer or condition of the same Statemachine. ` +
        `Awaiting it would deadlock: the machine runs one operation at a time and the runner ` +
        `is blocked on your callback. Use the EnqueueContext passed to after-observers to ` +
        `chain events instead.`,
    );
    this.name = "ReentrancyError";
  }
}
