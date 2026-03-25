import type { StateNameDetectorInterface } from "../interfaces/StateNameDetectorInterface.js";
import type { StatefulInterface } from "../interfaces/StatefulInterface.js";

function isStateful(obj: unknown): obj is StatefulInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getCurrentStateName" in obj &&
    typeof (obj as StatefulInterface).getCurrentStateName === "function"
  );
}

export class StatefulStateNameDetector implements StateNameDetectorInterface {
  detectCurrentStateName(subject: unknown): string | null {
    if (isStateful(subject)) {
      return subject.getCurrentStateName();
    }
    throw new Error("Subject has to implement the StatefulInterface!");
  }
}
