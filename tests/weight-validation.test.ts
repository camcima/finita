import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  GraphValidationError,
  WeightTransition,
} from "../src/index.js";
import type {
  TransitionInterface,
  TransitionSelectorInterface,
} from "../src/index.js";

describe("ProcessBuilder weight validation", () => {
  for (const weight of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    it(`rejects weight ${String(weight)} with code invalidTransitionWeight`, () => {
      const builder = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b");
      let caught: unknown;
      try {
        builder.addTransition("a", "b", { event: "go", weight });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GraphValidationError);
      expect((caught as GraphValidationError).code).toBe(
        "invalidTransitionWeight",
      );
    });
  }

  it("accepts finite weights including zero and negatives", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", weight: 0 })
      .addTransition("a", "b", { event: "back", weight: -2.5 })
      .build();
    expect(process.getName()).toBe("p");
  });
});

describe("WeightTransition epsilon validation", () => {
  for (const epsilon of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`rejects epsilon ${String(epsilon)}`, () => {
      expect(() => new WeightTransition(undefined, epsilon)).toThrowError(
        RangeError,
      );
    });
  }

  it("accepts the default epsilon", () => {
    expect(() => new WeightTransition()).not.toThrow();
  });
});

describe("WeightTransition defensive weight check", () => {
  const fakeTransition = (w: number) =>
    ({ getWeight: () => w }) as unknown as TransitionInterface;

  it("throws on a non-finite weight from a custom TransitionInterface", () => {
    expect(() =>
      new WeightTransition().selectTransition([
        fakeTransition(Number.POSITIVE_INFINITY),
      ]),
    ).toThrowError(RangeError);
  });

  it("keeps ties within epsilon and drops others (boundary is exclusive)", () => {
    let picked: TransitionInterface[] = [];
    const capture: TransitionSelectorInterface = {
      selectTransition: (ts) => {
        picked = Array.from(ts);
        return null;
      },
    };
    const selector = new WeightTransition(capture, 1);
    selector.selectTransition([
      fakeTransition(5),
      fakeTransition(4), // 5 - 4 = 1, NOT < 1 → dropped
      fakeTransition(4.5), // 5 - 4.5 = 0.5 < 1 → kept
    ]);
    expect(picked.map((t) => t.getWeight())).toEqual([5, 4.5]);
  });
});
