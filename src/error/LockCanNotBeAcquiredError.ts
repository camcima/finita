export class LockCanNotBeAcquiredError extends Error {
  constructor(message = "Lock can not be acquired!") {
    super(message);
    this.name = "LockCanNotBeAcquiredError";
  }
}
