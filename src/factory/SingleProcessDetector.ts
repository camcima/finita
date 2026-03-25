import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { ProcessInterface } from "../interfaces/ProcessInterface.js";

export class SingleProcessDetector implements ProcessDetectorInterface {
  private readonly process: ProcessInterface;

  constructor(process: ProcessInterface) {
    this.process = process;
  }

  detectProcess(_subject: unknown): ProcessInterface {
    return this.process;
  }
}
