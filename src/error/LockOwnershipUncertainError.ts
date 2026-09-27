import { FinitaError } from "./FinitaError.js";

/**
 * A lock release failed earlier, so the machine can no longer tell whether it
 * still holds the lock: the unlock may have taken effect remotely with its
 * reply lost, or may never have happened. Running further operations on the
 * old ownership flag could violate mutual exclusion, so every operation is
 * rejected with this error until a manual Statemachine.releaseLock()
 * succeeds.
 *
 * `cause` carries the release failure. When the release cannot be confirmed
 * — typically because the lock was in fact already freed — discard the
 * machine and build a new one from persisted state.
 */
export class LockOwnershipUncertainError extends FinitaError {
  readonly code = "lockOwnershipUncertain";

  constructor(cause: unknown) {
    super(
      "Operation rejected: a previous lock release failed, so this machine " +
        "cannot tell whether it still holds the lock. Call releaseLock() and " +
        "confirm it succeeds, or discard the machine and rebuild it from " +
        "persisted state.",
      { cause },
    );
    this.name = "LockOwnershipUncertainError";
  }
}
