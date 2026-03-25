import type { ProcessDetectorInterface } from "../interfaces/ProcessDetectorInterface.js";
import type { ProcessInterface } from "../interfaces/ProcessInterface.js";

export abstract class AbstractNamedProcessDetector implements ProcessDetectorInterface {
  private readonly processes: Map<string, ProcessInterface> = new Map();

  protected abstract detectProcessName(subject: unknown): string;

  addProcess(process: ProcessInterface): void {
    this.processes.set(process.getName(), process);
  }

  hasProcess(name: string): boolean {
    return this.processes.has(name);
  }

  detectProcess(subject: unknown): ProcessInterface {
    const name = this.detectProcessName(subject);
    const process = this.processes.get(name);
    if (!process) {
      throw new Error(`Process "${name}" not found`);
    }
    return process;
  }
}
