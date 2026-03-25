import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { StatemachineInterface } from "../interfaces/StatemachineInterface.js";
import type { LoggerInterface } from "../interfaces/LoggerInterface.js";
import type { Named } from "../interfaces/Named.js";

function isStatemachine(obj: unknown): obj is StatemachineInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getCurrentState" in obj &&
    "getSubject" in obj
  );
}

function isNamed(obj: unknown): obj is Named {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getName" in obj &&
    typeof (obj as Named).getName === "function"
  );
}

function convertToString(obj: unknown): string {
  if (isNamed(obj)) {
    return obj.getName();
  }
  return String(obj);
}

export class TransitionLogger implements Observer {
  private readonly logger: LoggerInterface;
  private readonly loggerLevel: string;

  constructor(logger: LoggerInterface, loggerLevel = "info") {
    this.logger = logger;
    this.loggerLevel = loggerLevel;
  }

  update(subject: ObservableSubject): void {
    if (!isStatemachine(subject)) {
      return;
    }

    const context: Record<string, unknown> = {};
    context["subject"] = subject.getSubject();
    context["currentState"] = subject.getCurrentState();
    context["lastState"] = subject.getLastState();
    context["transition"] = subject.getSelectedTransition();

    let message = "Transition";

    if (context["subject"] != null) {
      message += ` for "${convertToString(context["subject"])}"`;
    }

    if (context["lastState"] != null) {
      message += ` from "${convertToString(context["lastState"])}"`;
    }

    if (context["currentState"] != null) {
      message += ` to "${convertToString(context["currentState"])}"`;
    }

    const transition = context["transition"] as {
      getEventName?: () => string | null;
      getConditionName?: () => string | null;
    } | null;
    if (transition && typeof transition.getEventName === "function") {
      const eventName = transition.getEventName();
      const condition = transition.getConditionName?.();
      if (eventName || condition) {
        message += " with";
        if (eventName) {
          message += ` event "${eventName}"`;
        }
        if (condition) {
          message += ` condition "${condition}"`;
        }
      }
    }

    this.logger.log(this.loggerLevel, message, context);
  }
}
