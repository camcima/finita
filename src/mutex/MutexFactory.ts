import type { MutexFactoryInterface } from "../interfaces/MutexFactoryInterface.js";
import type { MutexInterface } from "../interfaces/MutexInterface.js";
import type { LockAdapterInterface } from "../interfaces/LockAdapterInterface.js";
import { LockAdapterMutex } from "./LockAdapterMutex.js";

export type StringConverter = (subject: unknown) => string;

export class MutexFactory implements MutexFactoryInterface {
  private readonly lockAdapter: LockAdapterInterface;
  private readonly stringConverter: StringConverter;

  constructor(
    lockAdapter: LockAdapterInterface,
    stringConverter: StringConverter,
  ) {
    this.lockAdapter = lockAdapter;
    this.stringConverter = stringConverter;
  }

  createMutex(subject: unknown): MutexInterface {
    return new LockAdapterMutex(
      this.lockAdapter,
      this.stringConverter(subject),
    );
  }
}
