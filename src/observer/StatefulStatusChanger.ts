import type { AfterTransitionObserver } from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";
import type { StatefulInterface } from "../interfaces/StatefulInterface.js";

export class StatefulStatusChanger<TSubject extends StatefulInterface>
  implements AfterTransitionObserver<TSubject>
{
  private readonly subject: TSubject;

  constructor(subject: TSubject) {
    this.subject = subject;
  }

  notify(frame: TransitionFrame<TSubject>): void {
    this.subject.setCurrentStateName(frame.toState.getName());
  }
}
