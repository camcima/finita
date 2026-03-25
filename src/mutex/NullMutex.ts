import type { MutexInterface } from "../interfaces/MutexInterface.js";

export class NullMutex implements MutexInterface {
  private acquired = false;

  acquireLock(): boolean {
    this.acquired = true;
    return true;
  }

  releaseLock(): boolean {
    this.acquired = false;
    return true;
  }

  isAcquired(): boolean {
    return this.acquired;
  }

  isLocked(): boolean {
    return false;
  }
}
