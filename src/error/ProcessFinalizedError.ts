import { FinitaError } from "./FinitaError.js";

export class ProcessFinalizedError extends FinitaError {
  readonly code = "processFinalized";
  readonly processName: string;

  constructor(processName: string) {
    super(
      `Process "${processName}" has already been built; ProcessBuilder.build() may only be called once`,
    );
    this.name = "ProcessFinalizedError";
    this.processName = processName;
  }
}
