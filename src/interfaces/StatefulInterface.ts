export interface StatefulInterface {
  getCurrentStateName(): string;
  setCurrentStateName(stateName: string): void;
}
