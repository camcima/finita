import type {
  AfterTransitionObserver,
  EnqueueContext,
} from "../interfaces/AfterTransitionObserverInterface.js";
import type { TransitionFrame } from "../interfaces/TransitionFrameInterface.js";

/**
 * After-transition observer that fires an event named DEFAULT_EVENT_NAME
 * (or a custom name) when entering any state that has that event declared.
 *
 * The chained event is *enqueued*, not invoked inline: it runs as its own
 * top-level operation after the current operation completes. Other
 * after-observers registered after OnEnterObserver still see the original
 * frame, not the chained one.
 *
 * The chained event only fires if the machine is still in the entered state
 * when the queue drains — states passed through transiently by automatic
 * transitions do not fire onEnter.
 */
export class OnEnterObserver<
  TSubject = unknown,
> implements AfterTransitionObserver<TSubject> {
  static readonly DEFAULT_EVENT_NAME = "onEnter";

  private readonly eventName: string;

  constructor(eventName: string = OnEnterObserver.DEFAULT_EVENT_NAME) {
    this.eventName = eventName;
  }

  notify(frame: TransitionFrame<TSubject>, ctx: EnqueueContext): void {
    if (frame.toState.hasEvent(this.eventName)) {
      ctx.enqueue(
        this.eventName,
        new Map(frame.context),
        frame.toState.getName(),
      );
    }
  }
}
