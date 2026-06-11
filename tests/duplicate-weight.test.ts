import { describe, it, expect } from "vitest";
import { ProcessBuilder, DuplicateTransitionError } from "../src/index.js";

describe("ProcessBuilder duplicate transitions and weight", () => {
  it("throws when the same (from, event, to) is re-declared with a different weight", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", weight: 1 })
      .addTransition("a", "b", { event: "go", weight: 10 });
    let caught: unknown;
    try {
      b.build();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DuplicateTransitionError);
    const conflict = (caught as DuplicateTransitionError).conflict;
    expect(conflict.existingWeight).toBe(1);
    expect(conflict.newWeight).toBe(10);
    expect((caught as DuplicateTransitionError).message).toContain(
      "existing weight 1 vs new weight 10",
    );
  });

  it("does not conflict when an omitted weight matches the explicit default of 1", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" }) // weight defaults to 1
      .addTransition("a", "b", { event: "go", weight: 1 });
    const process = b.build();
    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
  });

  it("still allows idempotent re-declaration (same condition, same weight)", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", weight: 2 })
      .addTransition("a", "b", { event: "go", weight: 2 });
    const process = b.build();
    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
  });
});
