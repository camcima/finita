import type { MutexInterface } from "../interfaces/MutexInterface.js";
import type { LockAdapterInterface } from "../interfaces/LockAdapterInterface.js";

export class LockAdapterMutex implements MutexInterface {
  private readonly lockAdapter: LockAdapterInterface;
  private readonly resourceName: string;
  private acquired = false;

  constructor(lockAdapter: LockAdapterInterface, resourceName: string) {
    this.lockAdapter = lockAdapter;
    this.resourceName = resourceName;
  }

  async acquireLock(): Promise<boolean> {
    if (!this.acquired) {
      this.acquired = await this.lockAdapter.acquireLock(this.resourceName);
    }
    return this.acquired;
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
