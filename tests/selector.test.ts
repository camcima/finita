import { describe, it, expect } from "vitest";
import {
  State,
  Transition,
  CallbackCondition,
  Tautology,
  OneOrNoneActiveTransition,
  ScoreTransition,
  WeightTransition,
} from "../src/index.js";

describe("OneOrNoneActiveTransition", () => {
  const selector = new OneOrNoneActiveTransition();

  it("should return null for no transitions", () => {
    expect(selector.selectTransition([])).toBeNull();
  });

  it("should return single transition", () => {
    const t = new Transition(new State("s"));
    expect(selector.selectTransition([t])).toBe(t);
  });

  it("should throw for multiple transitions", () => {
    const t1 = new Transition(new State("s1"));
    const t2 = new Transition(new State("s2"));
    expect(() => selector.selectTransition([t1, t2])).toThrow("More than one");
  });
});

describe("ScoreTransition", () => {
  it("should prefer transitions with event and condition", () => {
    const cond = new CallbackCondition("cond", () => true);
    const t1 = new Transition(new State("s1")); // score 0
    const t2 = new Transition(new State("s2"), "event"); // score 2
    const t3 = new Transition(new State("s3"), "event", cond); // score 3
    const selector = new ScoreTransition();
    expect(selector.selectTransition([t1, t2, t3])).toBe(t3);
  });

  it("should delegate ties to inner selector", () => {
    const t1 = new Transition(new State("s1"), "a");
    const t2 = new Transition(new State("s2"), "b");
    const selector = new ScoreTransition();
    expect(() => selector.selectTransition([t1, t2])).toThrow("More than one");
  });
});

describe("WeightTransition", () => {
  it("should prefer highest weight", () => {
    const t1 = new Transition(new State("s1"));
    t1.setWeight(1);
    const t2 = new Transition(new State("s2"));
    t2.setWeight(5);
    const t3 = new Transition(new State("s3"));
    t3.setWeight(3);
    const selector = new WeightTransition();
    expect(selector.selectTransition([t1, t2, t3])).toBe(t2);
  });

  it("should delegate ties to inner selector", () => {
    const t1 = new Transition(new State("s1"));
    t1.setWeight(5);
    const t2 = new Transition(new State("s2"));
    t2.setWeight(5);
    const selector = new WeightTransition();
    expect(() => selector.selectTransition([t1, t2])).toThrow("More than one");
  });
});

// === PHP-ported tests ===

describe("ScoreTransition (PHP-ported)", () => {
  it("should select single transition without event or condition", () => {
    const target = new State("TargetState");
    const t = new Transition(target);
    const selector = new ScoreTransition();
    expect(selector.selectTransition([t])).toBe(t);
  });

  it("should prefer transition with condition over bare transition", () => {
    const target = new State("TargetState");
    const tBare = new Transition(target);
    const condition = new Tautology("Always True");
    const tWithCondition = new Transition(target, null, condition);
    const selector = new ScoreTransition();
    expect(selector.selectTransition([tBare, tWithCondition])).toBe(
      tWithCondition,
    );
  });

  it("should prefer transition with event over bare transition", () => {
    const target = new State("TargetState");
    const tBare = new Transition(target);
    const tWithEvent = new Transition(target, "testEvent");
    const selector = new ScoreTransition();
    expect(selector.selectTransition([tBare, tWithEvent])).toBe(tWithEvent);
  });

  it("should prefer transition with event and condition over all others", () => {
    const target = new State("TargetState");
    const tBare = new Transition(target);
    const condition = new Tautology("Always True");
    const tWithCondition = new Transition(target, null, condition);
    const tWithEventAndCondition = new Transition(
      target,
      "testEvent",
      condition,
    );
    const selector = new ScoreTransition();
    expect(
      selector.selectTransition([
        tBare,
        tWithCondition,
        tWithEventAndCondition,
      ]),
    ).toBe(tWithEventAndCondition);
  });

  it("should throw if more than one transition at highest score level", () => {
    const target = new State("TargetState");
    const t1 = new Transition(target);
    const t2 = new Transition(target);
    const selector = new ScoreTransition();
    expect(() => selector.selectTransition([t1, t2])).toThrow();
  });
});

describe("WeightTransition (PHP-ported)", () => {
  it("should prefer transition with higher weight (small values)", () => {
    const target = new State("TargetState");
    const t1 = new Transition(target);
    t1.setWeight(0.001);
    const t2 = new Transition(target);
    t2.setWeight(0.002);
    const selector = new WeightTransition();
    expect(selector.selectTransition([t1, t2])).toBe(t2);
  });

  it("should throw if more than one transition has highest weight", () => {
    const target = new State("TargetState");
    const t1 = new Transition(target);
    t1.setWeight(0.001);
    const t2 = new Transition(target);
    t2.setWeight(0.001);
    const selector = new WeightTransition();
    expect(() => selector.selectTransition([t1, t2])).toThrow();
  });
});
