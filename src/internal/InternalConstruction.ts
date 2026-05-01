/**
 * Symbol-based construction guard for State / Transition / Process.
 *
 * These classes' constructors require this symbol as the first argument.
 * Only ProcessBuilder imports it, ensuring only the builder can instantiate
 * the graph. User code receives an opaque type error if it tries to call
 * `new State(...)` directly.
 */
export const INTERNAL_CONSTRUCTION_KEY: unique symbol = Symbol(
  "@camcima/finita/InternalConstruction",
);
export type InternalConstructionKey = typeof INTERNAL_CONSTRUCTION_KEY;
