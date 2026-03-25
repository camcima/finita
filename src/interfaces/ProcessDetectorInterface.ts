import type { ProcessInterface } from "./ProcessInterface.js";

export interface ProcessDetectorInterface<TSubject = unknown> {
  detectProcess(subject: TSubject): ProcessInterface;
}
