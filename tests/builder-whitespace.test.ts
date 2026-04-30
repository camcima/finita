import { describe, it, expect } from "vitest";
import { ProcessBuilder } from "../src/ProcessBuilder.js";
import { GraphValidationError } from "../src/error/index.js";

describe("ProcessBuilder.addTransition whitespace validation", () => {
  it("rejects empty event name with code invalidEventName", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() => b.addTransition("a", "b", { event: "" })).toThrow(
      GraphValidationError,
    );
    try {
      b.addTransition("a", "b", { event: "" });
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("invalidEventName");
    }
  });

  it("rejects whitespace-only event name", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() => b.addTransition("a", "b", { event: "   " })).toThrow(
      GraphValidationError,
    );
  });

  it("rejects event name with leading whitespace", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() => b.addTransition("a", "b", { event: "  go" })).toThrow(
      GraphValidationError,
    );
    try {
      b.addTransition("a", "b", { event: "  go" });
    } catch (err) {
      expect((err as GraphValidationError).code).toBe("invalidEventName");
    }
  });

  it("rejects event name with trailing whitespace", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() => b.addTransition("a", "b", { event: "go " })).toThrow(
      GraphValidationError,
    );
  });

  it("rejects event name with internal tab", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() => b.addTransition("a", "b", { event: "\tgo" })).toThrow(
      GraphValidationError,
    );
  });

  it("accepts a clean event name", () => {
    const b = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b");
    expect(() => b.addTransition("a", "b", { event: "go" })).not.toThrow();
  });
});
