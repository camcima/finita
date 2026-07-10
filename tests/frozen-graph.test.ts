import { describe, it, expect } from "vitest";
import { ProcessBuilder } from "../src/index.js";

describe("runtime immutability of the built graph", () => {
  const build = () =>
    new ProcessBuilder("p")
      .addState("a", { initial: true, metadata: { k: "v" } })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

  it("freezes Process, every State, and every Transition", () => {
    const process = build();
    expect(Object.isFrozen(process)).toBe(true);
    for (const state of process.getStates()) {
      expect(Object.isFrozen(state)).toBe(true);
      for (const transition of state.getTransitions()) {
        expect(Object.isFrozen(transition)).toBe(true);
      }
    }
  });

  it("mutation attempts on a frozen State throw in strict mode", () => {
    const state = build().getInitialState() as unknown as Record<
      string,
      unknown
    >;
    expect(() => {
      state.name = "hacked";
    }).toThrowError(TypeError);
  });
});
