import type { MutexFactoryInterface } from "../interfaces/MutexFactoryInterface.js";
import type { MutexInterface } from "../interfaces/MutexInterface.js";
import type { LockAdapterInterface } from "../interfaces/LockAdapterInterface.js";
import { LockAdapterMutex } from "./LockAdapterMutex.js";

export type StringConverter<TSubject = unknown> = (subject: TSubject) => string;

export class MutexFactory<
  TSubject = unknown,
> implements MutexFactoryInterface<TSubject> {
  private readonly lockAdapter: LockAdapterInterface;
  private readonly stringConverter: StringConverter<TSubject>;

  constructor(
    lockAdapter: LockAdapterInterface,
    stringConverter: StringConverter<TSubject>,
  ) {
    this.lockAdapter = lockAdapter;
    this.stringConverter = stringConverter;
  }

  createMutex(subject: TSubject): MutexInterface {
    return new LockAdapterMutex(
      this.lockAdapter,
      this.stringConverter(subject),
    );
  }
}
