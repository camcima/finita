import { describe, it, expect } from "vitest";
import { GraphBuilder, ProcessBuilder } from "../src/index.js";

const makeBuilder = () => {
  const process = new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();
  const gb = new GraphBuilder();
  gb.addStates(process.getStates());
  return gb;
};

describe("graph direction validation", () => {
  it("rejects a DOT rankdir injection payload", () => {
    const gb = makeBuilder();
    expect(() =>
      gb.toDot({ rankdir: "LR;\n  injected [shape=box]" as never }),
    ).toThrowError(RangeError);
  });

  it("rejects an invalid Mermaid direction", () => {
    const gb = makeBuilder();
    expect(() => gb.toMermaid({ direction: "sideways" as never })).toThrowError(
      RangeError,
    );
  });

  it("accepts all four directions in both formats", () => {
    const gb = makeBuilder();
    for (const d of ["TB", "BT", "LR", "RL"] as const) {
      expect(gb.toDot({ rankdir: d })).toContain(`rankdir=${d};`);
      expect(gb.toMermaid({ direction: d })).toContain(`direction ${d}`);
    }
  });
});
