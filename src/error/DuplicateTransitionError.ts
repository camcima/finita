import { FinitaError } from "./FinitaError.js";

export interface DuplicateTransitionConflict {
  fromState: string;
  toState: string;
  eventName: string | null;
  existingConditionName: string | null;
  newConditionName: string | null;
}

export class DuplicateTransitionError extends FinitaError {
  readonly code = "duplicateTransition";
  readonly conflict: Readonly<DuplicateTransitionConflict>;

  constructor(conflict: DuplicateTransitionConflict) {
    const eventLabel = conflict.eventName ?? "<automatic>";
    const existing = conflict.existingConditionName ?? "<no condition>";
    const incoming = conflict.newConditionName ?? "<no condition>";
    super(
      `Conflicting transition declarations from "${conflict.fromState}" to "${conflict.toState}" on event "${eventLabel}": existing condition "${existing}" vs new condition "${incoming}"`,
    );
    this.name = "DuplicateTransitionError";
    this.conflict = Object.freeze({ ...conflict });
  }
}
