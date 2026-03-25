import type { EventInterface } from "./EventInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

export interface CallbackInterface {
  invoke(): MaybePromise<void>;
}

export interface DispatcherInterface extends CallbackInterface {
  dispatch(
    event: EventInterface,
    args?: unknown[],
    onReadyCallback?: CallbackInterface,
  ): void;
  isReady(): boolean;
  invoke(): Promise<void>;
}
