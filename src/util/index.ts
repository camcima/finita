import type { Named } from "../interfaces/Named.js";

export function isNamed(obj: unknown): obj is Named {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getName" in obj &&
    typeof (obj as Named).getName === "function"
  );
}

/** Render any value by its getName() when present, String(value) otherwise. */
export function nameOrString(obj: unknown): string {
  if (isNamed(obj)) return obj.getName();
  return String(obj);
}

/**
 * True for any thenable. Callers use it to await a MaybePromise only when it
 * actually is one: awaiting a plain value still yields to the microtask
 * queue, which ends the synchronous window the re-entrancy guard relies on.
 */
export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}
