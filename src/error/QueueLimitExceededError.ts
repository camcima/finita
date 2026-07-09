import { FinitaError } from "./FinitaError.js";

export class QueueLimitExceededError extends FinitaError {
  readonly code = "queueLimitExceeded";

  constructor(limit: number, eventName: string | null) {
    super(
      `${eventName === null ? "checkTransitions()" : `triggerEvent("${eventName}")`} rejected: ` +
        `the operation queue already holds ${limit} pending operation(s) (maxQueueLength = ${limit}).`,
    );
    this.name = "QueueLimitExceededError";
  }
}
