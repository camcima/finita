import type { StateNameDetectorInterface } from "../interfaces/StateNameDetectorInterface.js";
import type { StatefulInterface } from "../interfaces/StatefulInterface.js";
import { InvalidSubjectError } from "../error/InvalidSubjectError.js";

function isStateful(obj: unknown): obj is StatefulInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getCurrentStateName" in obj &&
    typeof (obj as StatefulInterface).getCurrentStateName === "function"
  );
}

export class StatefulStateNameDetector implements StateNameDetectorInterface<StatefulInterface> {
  detectCurrentStateName(subject: StatefulInterface): string | null {
    if (isStateful(subject)) {
      return subject.getCurrentStateName();
    }
    throw new InvalidSubjectError("StatefulInterface", ["getCurrentStateName"]);
  }
}
