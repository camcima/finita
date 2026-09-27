import { describe, it, expect } from "vitest";
import { ProcessBuilder, Tautology } from "../src/index.js";

/**
 * Transition identity was built by joining (from, event, to) with NUL. Names
 * may legally contain NUL, so distinct tuples could share a key.
 */
describe("transition identity encoding", () => {
  const colliding = () =>
    new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("a\0x")
      .addState("z");

  it("keeps two distinct transitions whose delimiter-joined keys collide", () => {
    const process = colliding()
      .addTransition("a", "z", { event: "x\0y" })
      .addTransition("a\0x", "z", { event: "y" })
      .build();
    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
    expect(Array.from(process.getState("a\0x").getTransitions())).toHaveLength(
      1,
    );
  });

  it("does not report a false conflict between colliding tuples", () => {
    expect(() =>
      colliding()
        .addTransition("a", "z", { event: "x\0y", weight: 1 })
        .addTransition("a\0x", "z", { event: "y", weight: 2 })
        .build(),
    ).not.toThrow();
  });

  it("still deduplicates a genuinely identical re-declaration", () => {
    const condition = new Tautology();
    const process = colliding()
      .addTransition("a", "z", { event: "go", condition })
      .addTransition("a", "z", { event: "go", condition })
      .build();
    expect(Array.from(process.getState("a").getTransitions())).toHaveLength(1);
  });
});
