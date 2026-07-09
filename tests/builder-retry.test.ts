import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  GraphValidationError,
  ProcessFinalizedError,
} from "../src/index.js";

describe("ProcessBuilder recovery after a failed build", () => {
  it("allows fixing the graph and rebuilding after a validation failure", () => {
    const builder = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addTransition("a", "missing", { event: "go" });
    expect(() => builder.build()).toThrowError(GraphValidationError);

    builder.addState("missing");
    const process = builder.build();
    expect(process.hasState("missing")).toBe(true);
  });

  it("still rejects reuse after a successful build", () => {
    const builder = new ProcessBuilder("p").addState("a", { initial: true });
    builder.build();
    expect(() => builder.build()).toThrowError(ProcessFinalizedError);
    expect(() => builder.addState("b")).toThrowError(ProcessFinalizedError);
  });
});
