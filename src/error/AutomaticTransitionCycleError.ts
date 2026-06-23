import { FinitaError } from "./FinitaError.js";

export class AutomaticTransitionCycleError extends FinitaError {
  readonly code = "automaticTransitionCycle";
  readonly stateName: string;
  readonly hopLimit: number;

  constructor(stateName: string, hopLimit: number) {
    super(
      `Automatic transitions exceeded ${hopLimit} hops without reaching a quiescent state ` +
        `(last target: "${stateName}") — the graph is likely looping forever. ` +
        `Raise maxAutomaticHops if the loop is legitimate and bounded. ` +
        `Transitions committed before this error are NOT rolled back.`,
    );
    this.name = "AutomaticTransitionCycleError";
    this.stateName = stateName;
    this.hopLimit = hopLimit;
  }
}
