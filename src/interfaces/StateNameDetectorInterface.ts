export interface StateNameDetectorInterface {
  detectCurrentStateName(subject: unknown): string | null;
}
