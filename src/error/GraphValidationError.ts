import { FinitaError } from "./FinitaError.js";

export type GraphValidationCode =
  | "unknownTarget"
  | "unknownSource"
  | "missingInitialState"
  | "multipleInitialStates"
  | "invalidEventName"
  | "invalidConditionName"
  | "orphanState";

export class GraphValidationError extends FinitaError {
  readonly code: GraphValidationCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: GraphValidationCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(`[${code}] ${message}`);
    this.name = "GraphValidationError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
