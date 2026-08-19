import { FinitaError } from "./FinitaError.js";

/** One of the simultaneously-active transitions that caused the ambiguity. */
export interface AmbiguousTransitionCandidate {
  targetStateName: string;
  eventName: string | null;
  conditionName: string | null;
  weight: number;
}

export class AmbiguousTransitionError extends FinitaError {
  readonly code = "ambiguousTransition";
  readonly activeCount: number;
  /** The competing transitions — what you need to resolve the ambiguity. */
  readonly candidates: readonly Readonly<AmbiguousTransitionCandidate>[];

  constructor(
    activeCount: number,
    candidates: Iterable<AmbiguousTransitionCandidate> = [],
  ) {
    const list = Array.from(candidates, (c) => Object.freeze({ ...c }));
    const detail =
      list.length > 0
        ? ` Candidates: ${list.map(describeCandidate).join("; ")}.`
        : "";
    super(
      `More than one transition is active! (active count: ${activeCount})${detail}`,
    );
    this.name = "AmbiguousTransitionError";
    this.activeCount = activeCount;
    this.candidates = Object.freeze(list);
  }
}

function describeCandidate(candidate: AmbiguousTransitionCandidate): string {
  const parts = [`-> "${candidate.targetStateName}"`];
  parts.push(
    candidate.eventName === null
      ? "on <automatic>"
      : `on event "${candidate.eventName}"`,
  );
  if (candidate.conditionName !== null) {
    parts.push(`if ${candidate.conditionName}`);
  }
  parts.push(`weight ${candidate.weight}`);
  return parts.join(" ");
}
