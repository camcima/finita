import { describe, it, expect } from "vitest";
import { ProcessBuilder } from "../src/ProcessBuilder.js";
import { GraphBuilder } from "../src/graph/GraphBuilder.js";
import { StateCollection } from "../src/StateCollection.js";

describe("GraphBuilder.addState idempotency (#14)", () => {
  function build() {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    return process;
  }

  it("addState twice produces the same edges as once", () => {
    const process = build();
    const a = process.getState("a");

    const once = new GraphBuilder();
    once.addState(a);

    const twice = new GraphBuilder();
    twice.addState(a);
    twice.addState(a);

    expect(twice.getGraph().edges.length).toBe(once.getGraph().edges.length);
    expect(twice.getGraph().nodes.length).toBe(once.getGraph().nodes.length);
  });

  it("addStates over the same iterable twice does not double edges", () => {
    const process = build();
    const states = Array.from(process.getStates());

    const once = new GraphBuilder();
    once.addStates(states);

    const twice = new GraphBuilder();
    twice.addStates(states);
    twice.addStates(states);

    expect(twice.getGraph().edges.length).toBe(once.getGraph().edges.length);
  });

  it("addStateCollection called twice does not double edges", () => {
    const process = build();
    const collection = new StateCollection(process.getStates());

    const once = new GraphBuilder();
    once.addStateCollection(collection);

    const twice = new GraphBuilder();
    twice.addStateCollection(collection);
    twice.addStateCollection(collection);

    expect(twice.getGraph().edges.length).toBe(once.getGraph().edges.length);
  });
});
