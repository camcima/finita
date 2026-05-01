import { FinitaError } from "./FinitaError.js";

export class InvalidSubjectError extends FinitaError {
  readonly code = "invalidSubject";
  readonly expectedInterface: string;
  readonly missingMembers: readonly string[];

  constructor(expectedInterface: string, missingMembers: Iterable<string>) {
    const members = Array.from(missingMembers);
    const memberList = members.map((m) => `"${m}"`).join(", ");
    super(
      `Subject does not satisfy ${expectedInterface}; missing member(s): ${memberList || "(unknown)"}`,
    );
    this.name = "InvalidSubjectError";
    this.expectedInterface = expectedInterface;
    this.missingMembers = Object.freeze([...members]);
  }
}
