export class DuplicateStateError extends Error {
  readonly stateName: string;

  constructor(stateName: string) {
    super(
      `There is already a different state with name "${stateName}" in this collection`,
    );
    this.name = "DuplicateStateError";
    this.stateName = stateName;
  }
}
