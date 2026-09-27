import type { MutexInterface } from "../interfaces/MutexInterface.js";
import type { LockAdapterInterface } from "../interfaces/LockAdapterInterface.js";

export class LockAdapterMutex implements MutexInterface {
  private readonly lockAdapter: LockAdapterInterface;
  private readonly resourceName: string;
  private acquired = false;
  private pendingAcquire: Promise<boolean> | null = null;

  constructor(lockAdapter: LockAdapterInterface, resourceName: string) {
    this.lockAdapter = lockAdapter;
    this.resourceName = resourceName;
  }

  /**
   * Overlapping calls share one underlying acquire: the `acquired` flag is
   * only set after the adapter resolves, so without this both callers would
   * pass the check and acquire twice on a non-idempotent adapter (database
   * advisory locks, redis SET NX). The pending promise is cleared once it
   * settles, so a failed acquire can still be retried.
   *
   * The clearing is attached to the attempt only after it is stored: an
   * adapter that throws synchronously settles the attempt before the
   * assignment would otherwise run, and clearing inside the attempt itself
   * would then leave the rejected promise cached forever.
   */
  async acquireLock(): Promise<boolean> {
    if (this.acquired) {
      return true;
    }
    if (!this.pendingAcquire) {
      const attempt = (async () => {
        this.acquired = await this.lockAdapter.acquireLock(this.resourceName);
        return this.acquired;
      })();
      this.pendingAcquire = attempt;
      const clear = (): void => {
        if (this.pendingAcquire === attempt) this.pendingAcquire = null;
      };
      attempt.then(clear, clear);
    }
    return this.pendingAcquire;
  }

  async releaseLock(): Promise<boolean> {
    if (this.acquired) {
      const result = await this.lockAdapter.releaseLock(this.resourceName);
      if (result) {
        this.acquired = false;
      }
      return result;
    }
    return false;
  }

  isAcquired(): boolean {
    return this.acquired;
  }

  async isLocked(): Promise<boolean> {
    return this.lockAdapter.isLocked(this.resourceName);
  }
}
