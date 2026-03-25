import type { MutexInterface } from "./MutexInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

export interface MutexFactoryInterface<TSubject = unknown> {
  createMutex(subject: TSubject): MaybePromise<MutexInterface>;
}
