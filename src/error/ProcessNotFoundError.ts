import { FinitaError } from "./FinitaError.js";

export class ProcessNotFoundError extends FinitaError {
  readonly code = "processNotFound";
  readonly processName: string;
  readonly availableProcesses: readonly string[];

  constructor(processName: string, availableProcesses: Iterable<string>) {
    const list = Array.from(availableProcesses);
    const display =
      list.length > 0 ? list.map((n) => `"${n}"`).join(", ") : "(none)";
    super(`Process "${processName}" not found. Available: ${display}`);
    this.name = "ProcessNotFoundError";
    this.processName = processName;
    this.availableProcesses = Object.freeze([...list]);
  }
}
