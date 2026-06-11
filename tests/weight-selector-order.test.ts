import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  WeightTransition,
  AmbiguousTransitionError,
} from "../src/index.js";
import type { TransitionInterface } from "../src/index.js";

/** Build a star process a→{targets} on event "go" with the given weights, return a's transitions. */
function transitionsWithWeights(weights: number[]): TransitionInterface[] {
  const b = new ProcessBuilder("p").addState("a", { initial: true });
  weights.forEach((_, i) => b.addState(`t${i}`));
  weights.forEach((w, i) =>
    b.addTransition("a", `t${i}`, { event: "go", weight: w }),
  );
  const process = b.build();
  return Array.from(process.getState("a").getTransitions());
}

describe("WeightTransition order independence", () => {
  it("gives the same outcome for ascending and descending declaration order", () => {
    const selector = new WeightTransition(); // epsilon 0.001
    const asc = transitionsWithWeights([1.0, 1.0009, 1.0018]);
    const desc = transitionsWithWeights([1.0018, 1.0009, 1.0]);

    // 1.0018 and 1.0009 are within epsilon of the max → a 2-way tie in BOTH
    // orders → the default inner selector throws AmbiguousTransitionError.
    expect(() => selector.selectTransition(asc)).toThrow(
      AmbiguousTransitionError,
    );
    expect(() => selector.selectTransition(desc)).toThrow(
      AmbiguousTransitionError,
    );
  });

  it("selects the clear winner regardless of order", () => {
    const selector = new WeightTransition();
    const asc = transitionsWithWeights([1.0, 1.002]);
    const desc = transitionsWithWeights([1.002, 1.0]);
    expect(selector.selectTransition(asc)?.getWeight()).toBe(1.002);
    expect(selector.selectTransition(desc)?.getWeight()).toBe(1.002);
  });

  it("returns null for an empty set", () => {
    const selector = new WeightTransition();
    expect(selector.selectTransition([])).toBeNull();
  });
});
