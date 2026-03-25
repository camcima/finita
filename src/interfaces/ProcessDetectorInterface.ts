import type { ProcessInterface } from "./ProcessInterface.js";

export interface ProcessDetectorInterface {
  detectProcess(subject: unknown): ProcessInterface;
}
