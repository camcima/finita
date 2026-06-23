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
