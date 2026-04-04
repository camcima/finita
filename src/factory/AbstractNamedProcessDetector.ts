import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { ProcessInterface } from "../interfaces/ProcessInterface.js";

export abstract class AbstractNamedProcessDetector<
  TSubject = unknown,
> implements ProcessDetectorInterface<TSubject> {
  private readonly processes: Map<string, ProcessInterface> = new Map();

  protected abstract detectProcessName(subject: TSubject): string;

  addProcess(process: ProcessInterface): void {
    this.processes.set(process.getName(), process);
  }

  hasProcess(name: string): boolean {
    return this.processes.has(name);
  }

  detectProcess(subject: TSubject): ProcessInterface {
    const name = this.detectProcessName(subject);
    const process = this.processes.get(name);
    if (!process) {
      throw new Error(`Process "${name}" not found`);
    }
    return process;
  }
}
