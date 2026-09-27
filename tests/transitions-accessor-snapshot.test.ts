import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";

const build = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();

describe("State.getTransitions() ownership", () => {
  it("mutating the returned collection does not change the graph", async () => {
    const process = build();
    const returned = process.getState("a").getTransitions() as unknown as {
      clear?: () => void;
      length?: number;
    };
    if (typeof returned.clear === "function") returned.clear();
    if (Array.isArray(returned)) returned.length = 0;

    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
  });

  it("machines sharing the process keep working after a consumer mutates it", async () => {
    const process = build();
    const first = new Statemachine({}, process);
    const returned = process.getState("a").getTransitions() as unknown as {
      clear?: () => void;
    };
    returned.clear?.();
    const second = new Statemachine({}, process);

    await first.triggerEvent("go");
    await second.triggerEvent("go");
    expect(first.getCurrentState().getName()).toBe("b");
    expect(second.getCurrentState().getName()).toBe("b");
  });
});
