import type { Observer, ObservableSubject } from "../interfaces/Observer.js";
import type { StatemachineInterface } from "../interfaces/StatemachineInterface.js";

function isStatemachine(obj: unknown): obj is StatemachineInterface {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getCurrentState" in obj &&
    "triggerEvent" in obj
  );
}

export class OnEnterObserver implements Observer {
  static readonly DEFAULT_EVENT_NAME = "onEnter";

  private readonly eventName: string;

  constructor(eventName = OnEnterObserver.DEFAULT_EVENT_NAME) {
    this.eventName = eventName;
  }

  async update(subject: ObservableSubject): Promise<void> {
    if (
      isStatemachine(subject) &&
      subject.getCurrentState().hasEvent(this.eventName)
    ) {
      const sm = subject as StatemachineInterface;
      const autorelease = sm.isAutoreleaseLock();
      sm.setAutoreleaseLock(false);
      try {
        await sm.triggerEvent(
          this.eventName,
          sm.getCurrentContext() ?? undefined,
        );
      } finally {
        sm.setAutoreleaseLock(autorelease);
      }
    }
  }
}
