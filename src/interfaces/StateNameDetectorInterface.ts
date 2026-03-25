export interface StateNameDetectorInterface<TSubject = unknown> {
  detectCurrentStateName(subject: TSubject): string | null;
}
