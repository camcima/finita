import type { EventInterface } from "./EventInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

/** @deprecated No longer used internally; will be removed in v4. */
export interface CallbackInterface {
  invoke(): MaybePromise<void>;
}

/** @deprecated No longer used internally; will be removed in v4. */
export interface DispatcherInterface extends CallbackInterface {
  dispatch(event: EventInterface, args?: unknown[]): void;
  invoke(): Promise<void>;
}
