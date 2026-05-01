import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";
import type { LoggerInterface } from "../interfaces/LoggerInterface.js";
import type { Named } from "../interfaces/Named.js";

function isNamed(obj: unknown): obj is Named {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getName" in obj &&
    typeof (obj as Named).getName === "function"
  );
}

function asString(obj: unknown): string {
  if (isNamed(obj)) return obj.getName();
  return String(obj);
}

export class TransitionLogger<
  TSubject = unknown,
> implements AfterTransitionObserver<TSubject> {
  private readonly logger: LoggerInterface;
  private readonly loggerLevel: string;

  constructor(logger: LoggerInterface, loggerLevel = "info") {
    this.logger = logger;
    this.loggerLevel = loggerLevel;
  }

  notify(frame: TransitionFrame<TSubject>): void {
    let message = "Transition";

    // Subject identity isn't on the frame in v3 — callers who want subject
    // names attach a custom observer that closes over the subject.

    message += ` from "${asString(frame.fromState)}" to "${asString(frame.toState)}"`;

    const eventName = frame.event ? frame.event.getName() : null;
    const conditionName = frame.condition ? frame.condition.getName() : null;
    if (eventName || conditionName) {
      message += " with";
      if (eventName) message += ` event "${eventName}"`;
      if (conditionName) message += ` condition "${conditionName}"`;
    }

    this.logger.log(this.loggerLevel, message, {
      fromState: frame.fromState,
      toState: frame.toState,
      event: frame.event,
      transition: frame.transition,
      machineName: frame.machineName,
    });
  }
}
