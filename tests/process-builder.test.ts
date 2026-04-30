import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Tautology,
  Contradiction,
  CallbackCondition,
  ProcessFinalizedError,
  GraphValidationError,
  DuplicateTransitionError,
  DuplicateStateError,
} from "../src/index.js";

describe("ProcessBuilder", () => {
  it("builds a single-state process", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    expect(process.getName()).toBe("p");
    expect(process.getInitialState().getName()).toBe("a");
    expect(Array.from(process.getStates())).toHaveLength(1);
  });

  it("builds a multi-state graph with transitions", () => {
    const process = new ProcessBuilder("order")
      .addState("draft", { initial: true })
      .addState("submitted")
      .addState("paid")
      .addTransition("draft", "submitted", { event: "submit" })
      .addTransition("submitted", "paid", { event: "pay" })
      .build();
    expect(Array.from(process.getStates())).toHaveLength(3);
    expect(process.hasState("paid")).toBe(true);
    const draft = process.getState("draft");
    const draftTransitions = Array.from(draft.getTransitions());
    expect(draftTransitions).toHaveLength(1);
    expect(draftTransitions[0]!.getTargetState().getName()).toBe("submitted");
    expect(draftTransitions[0]!.getEventName()).toBe("submit");
  });

  it("supports automatic transitions (no event name)", () => {
    const process = new ProcessBuilder("auto")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { condition: new Tautology() })
      .build();
    const a = process.getState("a");
    const t = Array.from(a.getTransitions())[0]!;
    expect(t.getEventName()).toBeNull();
    expect(t.getConditionName()).toBe("Tautology");
  });

  it("preserves transition weights", () => {
    const process = new ProcessBuilder("w")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", weight: 5 })
      .build();
    const t = Array.from(process.getState("a").getTransitions())[0]!;
    expect(t.getWeight()).toBe(5);
  });

  it("throws ProcessFinalizedError if build() is called twice", () => {
    const builder = new ProcessBuilder("p").addState("a", { initial: true });
    builder.build();
    expect(() => builder.build()).toThrow(ProcessFinalizedError);
  });

  it("throws ProcessFinalizedError on addState after build()", () => {
    const builder = new ProcessBuilder("p").addState("a", { initial: true });
    builder.build();
    expect(() => builder.addState("b")).toThrow(ProcessFinalizedError);
  });

  it("throws ProcessFinalizedError on addTransition after build()", () => {
    const builder = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    builder.build();
    expect(() => builder.addTransition("a", "b", { event: "go" })).toThrow(
      ProcessFinalizedError,
    );
  });

  it("rejects duplicate addState calls", () => {
    expect(() => new ProcessBuilder("p").addState("a").addState("a")).toThrow(
      DuplicateStateError,
    );
  });

  it("requires exactly one initial state", () => {
    expect(() => new ProcessBuilder("p").addState("a").build()).toThrow(
      GraphValidationError,
    );
    try {
      new ProcessBuilder("p").addState("a").build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("missingInitialState");
    }
  });

  it("rejects multiple initial states", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b", { initial: true })
        .build(),
    ).toThrow(GraphValidationError);
    try {
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b", { initial: true })
        .build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("multipleInitialStates");
    }
  });

  it("rejects transition with unknown source state", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("nope", "a", { event: "go" })
        .build(),
    ).toThrow(GraphValidationError);
    try {
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("nope", "a", { event: "go" })
        .build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("unknownSource");
    }
  });

  it("rejects transition with unknown target state", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("a", "nope", { event: "go" })
        .build(),
    ).toThrow(GraphValidationError);
    try {
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addTransition("a", "nope", { event: "go" })
        .build();
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("unknownTarget");
    }
  });

  it("rejects empty event name (closes #5)", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "" }),
    ).toThrow(GraphValidationError);
  });

  it("rejects whitespace-only event name", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "   " }),
    ).toThrow(GraphValidationError);
  });

  it("dedups transitions with same (from, event, to, conditionName)", () => {
    const cond = new Tautology();
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", condition: cond })
      .addTransition("a", "b", { event: "go", condition: cond })
      .build();
    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
  });

  it("rejects conflicting duplicate transitions (closes #6)", () => {
    const c1 = new CallbackCondition(async () => true, "shared");
    const c2 = new CallbackCondition(async () => false, "shared");
    // Same name "shared" but different identity AND different logic.
    // Identity differs but name matches → according to spec, condition name
    // is the dedup key, so this is dedup'd. We instead test the conflict
    // case: same name? actually, condition.getName() comparison says
    // same name → dedup. To test the conflict path:
    const c3 = new Tautology(); // name "Tautology"
    const c4 = new Contradiction(); // name "Contradiction"
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "go", condition: c3 })
        .addTransition("a", "b", { event: "go", condition: c4 })
        .build(),
    ).toThrow(DuplicateTransitionError);
    // Suppress unused variable warnings
    void c1;
    void c2;
  });

  it("strictOrphans rejects unreachable states", () => {
    expect(() =>
      new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("orphan")
        .build({ strictOrphans: true }),
    ).toThrow(GraphValidationError);
  });

  it("strictOrphans=false (default) tolerates unreachable states", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("orphan")
      .build();
    expect(process.hasState("orphan")).toBe(true);
  });

  it("registers events implied by transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const a = process.getState("a");
    expect(a.hasEvent("go")).toBe(true);
    expect(a.getEventNames()).toContain("go");
  });

  it("returned Process is frozen", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    expect(Object.isFrozen(process)).toBe(true);
  });

  it("returned State has no addTransition method (closes #3)", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    const a = process.getState("a") as unknown as { addTransition?: unknown };
    expect(a.addTransition).toBeUndefined();
  });

  it("returned Transition has no setWeight method", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const t = Array.from(
      process.getState("a").getTransitions(),
    )[0]! as unknown as {
      setWeight?: unknown;
    };
    expect(t.setWeight).toBeUndefined();
  });

  it("rejects construction of State directly (defence in depth)", async () => {
    const mod = await import("../src/State.js");
    // @ts-expect-error — State's constructor requires the internal key
    expect(() => new mod.State("a")).toThrow();
  });
});
