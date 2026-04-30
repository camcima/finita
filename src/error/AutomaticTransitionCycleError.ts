import { FinitaError } from "./FinitaError.js";

export class AutomaticTransitionCycleError extends FinitaError {
  readonly code = "automaticTransitionCycle";
  readonly targetStateName: string;
  readonly visitedStateNames: readonly string[];

  constructor(targetStateName: string, visitedStateNames: Iterable<string>) {
    const visited = Array.from(visitedStateNames);
    super(
      `Automatic transition cycle detected: state "${targetStateName}" was already visited — this would cause infinite recursion`,
    );
    this.name = "AutomaticTransitionCycleError";
    this.targetStateName = targetStateName;
    this.visitedStateNames = Object.freeze([...visited]);
  }
}
