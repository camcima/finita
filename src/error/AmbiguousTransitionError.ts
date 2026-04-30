import { FinitaError } from "./FinitaError.js";

export class AmbiguousTransitionError extends FinitaError {
  readonly code = "ambiguousTransition";
  readonly activeCount: number;

  constructor(activeCount: number) {
    super(`More than one transition is active! (active count: ${activeCount})`);
    this.name = "AmbiguousTransitionError";
    this.activeCount = activeCount;
  }
}
