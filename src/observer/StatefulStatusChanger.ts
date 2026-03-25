import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { StatemachineInterface } from "../interfaces/StatemachineInterface.js";
import type { StatefulInterface } from "../interfaces/StatefulInterface.js";

function isStatemachine(obj: unknown): obj is StatemachineInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getCurrentState" in obj &&
    "getSubject" in obj
  );
}

function isStateful(obj: unknown): obj is StatefulInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "setCurrentStateName" in obj &&
    typeof (obj as StatefulInterface).setCurrentStateName === "function"
  );
}

export class StatefulStatusChanger implements Observer {
  update(subject: ObservableSubject): void {
    if (isStatemachine(subject)) {
      const subjectObj = subject.getSubject();
      if (isStateful(subjectObj)) {
        const stateName = subject.getCurrentState().getName();
        subjectObj.setCurrentStateName(stateName);
      }
    }
  }
}
