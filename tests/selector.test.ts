import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  CallbackCondition,
  Tautology,
  OneOrNoneActiveTransition,
  ScoreTransition,
  WeightTransition,
} from "../src/index.js";

/** Helper: build a process and extract all transitions from a state. */
function buildTransitions(
  specs: Array<{
    from: string;
    to: string;
    event?: string;
    condition?:
      | InstanceType<typeof CallbackCondition>
      | InstanceType<typeof Tautology>;
    weight?: number;
  }>,
): ReturnType<typeof Array.from> {
  const stateNames = new Set<string>();
  for (const s of specs) {
    stateNames.add(s.from);
    stateNames.add(s.to);
  }
  const builder = new ProcessBuilder("p");
  let first = true;
  for (const name of stateNames) {
    builder.addState(name, first ? { initial: true } : {});
    first = false;
  }
  for (const s of specs) {
    builder.addTransition(s.from, s.to, {
      event: s.event,
      condition: s.condition,
      weight: s.weight,
    });
  }
  const process = builder.build();
  return Array.from(process.getState(specs[0]!.from).getTransitions());
}

describe("OneOrNoneActiveTransition", () => {
  const selector = new OneOrNoneActiveTransition();

  it("should return null for no transitions", () => {
    expect(selector.selectTransition([])).toBeNull();
  });

  it("should return single transition", () => {
    const [t] = buildTransitions([{ from: "s", to: "t" }]);
    expect(selector.selectTransition([t!])).toBe(t);
  });

  it("should throw for multiple transitions", () => {
    const [t1, t2] = buildTransitions([
      { from: "s", to: "t1" },
      { from: "s", to: "t2" },
    ]);
    expect(() => selector.selectTransition([t1!, t2!])).toThrow(
      "More than one",
    );
  });
});

describe("ScoreTransition", () => {
  it("should prefer transitions with event and condition", () => {
    const cond = new CallbackCondition("cond", () => true);
    const [t1, t2, t3] = buildTransitions([
      { from: "s", to: "t1" }, // score 0
      { from: "s", to: "t2", event: "event" }, // score 2
      { from: "s", to: "t3", event: "event2", condition: cond }, // score 3
    ]);
    const selector = new ScoreTransition();
    expect(selector.selectTransition([t1!, t2!, t3!])).toBe(t3);
  });

  it("should delegate ties to inner selector", () => {
    const [t1, t2] = buildTransitions([
      { from: "s", to: "t1", event: "a" },
      { from: "s", to: "t2", event: "b" },
    ]);
    const selector = new ScoreTransition();
    expect(() => selector.selectTransition([t1!, t2!])).toThrow(
      "More than one",
    );
  });
});

describe("WeightTransition", () => {
  it("should prefer highest weight", () => {
    const [t1, t2, t3] = buildTransitions([
      { from: "s", to: "t1", weight: 1 },
      { from: "s", to: "t2", weight: 5 },
      { from: "s", to: "t3", weight: 3 },
    ]);
    const selector = new WeightTransition();
    expect(selector.selectTransition([t1!, t2!, t3!])).toBe(t2);
  });

  it("should delegate ties to inner selector", () => {
    const [t1, t2] = buildTransitions([
      { from: "s", to: "t1", weight: 5 },
      { from: "s", to: "t2", weight: 5 },
    ]);
    const selector = new WeightTransition();
    expect(() => selector.selectTransition([t1!, t2!])).toThrow(
      "More than one",
    );
  });
});

// === PHP-ported tests ===

describe("ScoreTransition (PHP-ported)", () => {
  it("should select single transition without event or condition", () => {
    const [t] = buildTransitions([{ from: "s", to: "target" }]);
    const selector = new ScoreTransition();
    expect(selector.selectTransition([t!])).toBe(t);
  });

  it("should prefer transition with condition over bare transition", () => {
    const condition = new Tautology("Always True");
    const [tBare, tWithCondition] = buildTransitions([
      { from: "s", to: "target1" },
      { from: "s", to: "target2", condition },
    ]);
    const selector = new ScoreTransition();
    expect(selector.selectTransition([tBare!, tWithCondition!])).toBe(
      tWithCondition,
    );
  });

  it("should prefer transition with event over bare transition", () => {
    const [tBare, tWithEvent] = buildTransitions([
      { from: "s", to: "target1" },
      { from: "s", to: "target2", event: "testEvent" },
    ]);
    const selector = new ScoreTransition();
    expect(selector.selectTransition([tBare!, tWithEvent!])).toBe(tWithEvent);
  });

  it("should prefer transition with event and condition over all others", () => {
    const condition = new Tautology("Always True");
    const [tBare, tWithCondition, tWithEventAndCondition] = buildTransitions([
      { from: "s", to: "target1" },
      { from: "s", to: "target2", condition },
      { from: "s", to: "target3", event: "testEvent", condition },
    ]);
    const selector = new ScoreTransition();
    expect(
      selector.selectTransition([
        tBare!,
        tWithCondition!,
        tWithEventAndCondition!,
      ]),
    ).toBe(tWithEventAndCondition);
  });

  it("should throw if more than one transition at highest score level", () => {
    const [t1, t2] = buildTransitions([
      { from: "s", to: "target1" },
      { from: "s", to: "target2" },
    ]);
    const selector = new ScoreTransition();
    expect(() => selector.selectTransition([t1!, t2!])).toThrow();
  });
});

describe("WeightTransition (PHP-ported)", () => {
  it("should prefer transition with higher weight (small values)", () => {
    const [t1, t2] = buildTransitions([
      { from: "s", to: "target1", weight: 0.001 },
      { from: "s", to: "target2", weight: 0.002 },
    ]);
    const selector = new WeightTransition();
    expect(selector.selectTransition([t1!, t2!])).toBe(t2);
  });

  it("should throw if more than one transition has highest weight", () => {
    const [t1, t2] = buildTransitions([
      { from: "s", to: "target1", weight: 0.001 },
      { from: "s", to: "target2", weight: 0.001 },
    ]);
    const selector = new WeightTransition();
    expect(() => selector.selectTransition([t1!, t2!])).toThrow();
  });
});
