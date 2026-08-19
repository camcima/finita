import { FinitaError } from "./FinitaError.js";

/**
 * The mutex reported a failed release by returning false, as
 * LockAdapterInterface specifies (e.g. a PostgreSQL advisory unlock that
 * returns false, or a Redis DEL that removed nothing).
 *
 * The lock must be assumed to still be held: the engine surfaces this so a
 * failed release can never be mistaken for a successful one, which would let
 * every later operation piggyback on — and never release — a stuck lock.
 */
export class LockCanNotBeReleasedError extends FinitaError {
  readonly code = "lockCanNotBeReleased";

  constructor(
    message = "Lock can not be released! releaseLock() returned false; the lock may still be held.",
  ) {
    super(message);
    this.name = "LockCanNotBeReleasedError";
  }
}
