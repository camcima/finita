export abstract class FinitaError extends Error {
  abstract readonly code: string;

  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    if (new.target === FinitaError) {
      throw new TypeError(
        "FinitaError is abstract and cannot be instantiated directly",
      );
    }
  }
}
