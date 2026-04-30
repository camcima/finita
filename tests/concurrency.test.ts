import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";

describe("Statemachine — smoke", () => {
  it("runs a single triggerEvent end-to-end", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("go");
    expect(sm.getCurrentState().getName()).toBe("b");
    expect(sm.getLastState()!.getName()).toBe("a");
  });

  it("runs an automatic checkTransitions", async () => {
    const { Tautology } = await import("../src/index.js");
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { condition: new Tautology() })
      .build();
    const sm = new Statemachine({}, process);
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("b");
  });
});
