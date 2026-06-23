import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  StateNotFoundError,
} from "../src/index.js";

describe("initialStateName empty string", () => {
  it("throws StateNotFoundError instead of silently using the initial state", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    expect(
      () => new Statemachine({}, process, { initialStateName: "" }),
    ).toThrow(StateNotFoundError);
  });
});
