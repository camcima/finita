import type { MutexInterface } from "./MutexInterface.js";
import type { MaybePromise } from "../MaybePromise.js";

export interface MutexFactoryInterface {
  createMutex(subject: unknown): MaybePromise<MutexInterface>;
}
