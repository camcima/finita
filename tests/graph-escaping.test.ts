import { describe, it, expect } from "vitest";
import { ProcessBuilder, GraphBuilder } from "../src/index.js";

describe("GraphBuilder escaping", () => {
  it("escapes backslashes in DOT output", () => {
    const process = new ProcessBuilder("p")
      .addState("tmp\\", { initial: true }) // state literally named  tmp\
      .addState("b")
      .addTransition("tmp\\", "b", { event: "go" })
      .build();
    const gb = new GraphBuilder();
    gb.addStates(process.getStates());
    const dot = gb.toDot();
    // One literal backslash must come out as two: "tmp\\"
    expect(dot).toContain('"tmp\\\\"');
    // No unterminated string: every quote in the output is balanced.
    expect((dot.match(/"/g) ?? []).length % 2).toBe(0);
  });

  it("escapes backslashes in mermaid labels", () => {
    const process = new ProcessBuilder("p")
      .addState("tmp\\", { initial: true })
      .addState("b")
      .addTransition("tmp\\", "b", { event: "go" })
      .build();
    const gb = new GraphBuilder();
    gb.addStates(process.getStates());
    expect(gb.toMermaid()).toContain("#92;");
  });
});
