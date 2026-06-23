import { describe, it, expect } from "vitest";
import { ProcessBuilder, GraphValidationError } from "../src/index.js";

describe("ProcessBuilder.addState name validation", () => {
  it("rejects an empty state name with code invalidStateName", () => {
    const b = new ProcessBuilder("p");
    expect(() => b.addState("")).toThrow(GraphValidationError);
    try {
      b.addState("");
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("invalidStateName");
    }
  });

  it("rejects a whitespace-padded state name", () => {
    const b = new ProcessBuilder("p");
    expect(() => b.addState(" pending ")).toThrow(GraphValidationError);
  });

  it("rejects a whitespace-padded condition name (unified rule)", () => {
    const cond = {
      getName: () => " cond ",
      checkCondition: () => true,
    };
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() =>
      b.addTransition("a", "b", { event: "go", condition: cond }),
    ).toThrow(GraphValidationError);
    try {
      b.addTransition("a", "b", { event: "go", condition: cond });
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("invalidConditionName");
    }
  });

  it("accepts clean names", () => {
    expect(() =>
      new ProcessBuilder("p").addState("pending", { initial: true }),
    ).not.toThrow();
  });
});
