import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";
import type { StatefulInterface } from "../interfaces/StatefulInterface.js";

export class StatefulStatusChanger<
  TSubject extends StatefulInterface,
> implements AfterTransitionObserver<TSubject> {
  private readonly subject: TSubject | null;

  /**
   * @param subject Optional explicit subject to write to. When omitted
   * (recommended), the observer writes to frame.subject — the subject of
   * whichever machine fired the transition — so a single instance can be
   * shared safely across every machine a Factory creates.
   */
  constructor(subject?: TSubject) {
    this.subject = subject ?? null;
  }

  notify(frame: TransitionFrame<TSubject>): void {
    (this.subject ?? frame.subject).setCurrentStateName(
      frame.toState.getName(),
    );
  }
}
