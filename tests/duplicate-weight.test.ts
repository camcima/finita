import { describe, it, expect } from "vitest";
import { ProcessBuilder, DuplicateTransitionError } from "../src/index.js";

describe("ProcessBuilder duplicate transitions and weight", () => {
  it("throws when the same (from, event, to) is re-declared with a different weight", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", weight: 1 })
      .addTransition("a", "b", { event: "go", weight: 10 });
    expect(() => b.build()).toThrow(DuplicateTransitionError);
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
