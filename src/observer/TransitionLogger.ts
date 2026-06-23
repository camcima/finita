import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";
import type { LoggerInterface } from "../interfaces/LoggerInterface.js";
import { nameOrString } from "../util/index.js";

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

    message += ` from "${nameOrString(frame.fromState)}" to "${nameOrString(frame.toState)}"`;

    const eventName = frame.event ? frame.event.getName() : null;
    const conditionName = frame.condition ? frame.condition.getName() : null;
    if (eventName || conditionName) {
      message += " with";
      if (eventName) message += ` event "${eventName}"`;
      if (conditionName) message += ` condition "${conditionName}"`;
    }

    // frame.subject is intentionally omitted from the log context — callers
    // who need subject identity attach a custom observer that closes over it.
    this.logger.log(this.loggerLevel, message, {
      fromState: frame.fromState,
      toState: frame.toState,
      event: frame.event,
      transition: frame.transition,
      machineName: frame.machineName,
    });
  }
}
