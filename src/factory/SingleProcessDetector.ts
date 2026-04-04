import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { ProcessInterface } from "../interfaces/ProcessInterface.js";

export class SingleProcessDetector<
  TSubject = unknown,
> implements ProcessDetectorInterface<TSubject> {
  private readonly process: ProcessInterface;

  constructor(process: ProcessInterface) {
    this.process = process;
  }

  detectProcess(_subject: TSubject): ProcessInterface {
    return this.process;
  }
}
