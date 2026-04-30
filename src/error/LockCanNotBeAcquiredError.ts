import { FinitaError } from "./FinitaError.js";

export class LockCanNotBeAcquiredError extends FinitaError {
  readonly code = "lockCanNotBeAcquired";

  constructor(message = "Lock can not be acquired!") {
    super(message);
    this.name = "LockCanNotBeAcquiredError";
  }
}
