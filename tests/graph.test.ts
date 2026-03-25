import { describe, it, expect } from "vitest";
import {
  State,
  Transition,
  StateCollection,
  GraphBuilder,
  CallbackCondition,
} from "../src/index.js";

describe("GraphBuilder", () => {
  it("should build graph from states", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    s2.addTransition(new Transition(s1, "back"));

    const builder = new GraphBuilder();
    builder.addState(s1);
    builder.addState(s2);

    const graph = builder.getGraph();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["s1", "s2"]);
  });

  it("should include transition labels", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const cond = new CallbackCondition("isReady", () => true);
    s1.addTransition(new Transition(s2, "go", cond));

    const builder = new GraphBuilder();
    builder.addState(s1);

    const graph = builder.getGraph();
    expect(graph.edges[0].label).toContain("E: go");
    expect(graph.edges[0].label).toContain("IF: isReady");
    expect(graph.edges[0].label).toContain("W: 1");
  });

  it("should handle addStateCollection", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const collection = new StateCollection();
    collection.addState(s1);
    collection.addState(s2);

    const builder = new GraphBuilder();
    builder.addStateCollection(collection);

    const graph = builder.getGraph();
    expect(graph.nodes).toHaveLength(2);
  });

  it("should not duplicate nodes", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    s2.addTransition(new Transition(s1, "back"));

    const builder = new GraphBuilder();
    builder.addStates([s1, s2]);

    const graph = builder.getGraph();
    expect(graph.nodes).toHaveLength(2);
  });

  describe("toDot", () => {
    it("should produce valid DOT output", () => {
      const s1 = new State("new");
      const s2 = new State("shipped");
      s1.addTransition(new Transition(s2, "ship"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot();
      expect(dot).toContain("digraph {");
      expect(dot).toContain("rankdir=LR;");
      expect(dot).toContain('"new" [label="new"];');
      expect(dot).toContain('"shipped" [label="shipped"];');
      expect(dot).toContain('"new" -> "shipped"');
      expect(dot).toContain("}");
    });

    it("should respect rankdir option", () => {
      const s1 = new State("a");
      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot({ rankdir: "TB" });
      expect(dot).toContain("rankdir=TB;");
    });

    it("should escape double quotes in labels", () => {
      const s1 = new State('state "one"');
      const s2 = new State('state "two"');
      s1.addTransition(new Transition(s2, "go"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot();
      expect(dot).toContain('state \\"one\\"');
      expect(dot).toContain('state \\"two\\"');
    });

    it("should include condition and event in edge labels", () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      const cond = new CallbackCondition("isReady", () => true);
      s1.addTransition(new Transition(s2, "go", cond));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot();
      expect(dot).toContain("E: go");
      expect(dot).toContain("IF: isReady");
    });
  });

  describe("toMermaid", () => {
    it("should produce valid Mermaid stateDiagram output", () => {
      const s1 = new State("new");
      const s2 = new State("shipped");
      s1.addTransition(new Transition(s2, "ship"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      expect(mermaid).toContain("stateDiagram-v2");
      expect(mermaid).toContain("direction LR");
      expect(mermaid).toContain('s_new : "new"');
      expect(mermaid).toContain('s_shipped : "shipped"');
      expect(mermaid).toContain("s_new --> s_shipped");
    });

    it("should respect direction option", () => {
      const s1 = new State("a");
      const s2 = new State("b");
      s1.addTransition(new Transition(s2, "go"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid({ direction: "TB" });
      expect(mermaid).toContain("direction TB");
    });

    it("should join multiline labels with separator", () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      const cond = new CallbackCondition("isReady", () => true);
      s1.addTransition(new Transition(s2, "go", cond));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // The multiline label (E: go\nIF: isReady\nW: 1) should be joined with " / "
      expect(mermaid).toContain("s_s1 --> s_s2 : E: go / IF: isReady / W: 1");
    });

    it("should handle automatic transitions (no event)", () => {
      const s1 = new State("active");
      const s2 = new State("expired");
      const cond = new CallbackCondition("timeout", () => true);
      s1.addTransition(new Transition(s2, null, cond));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      expect(mermaid).toContain("s_active --> s_expired : IF: timeout / W: 1");
    });

    it("should handle state names with spaces and punctuation", () => {
      const s1 = new State("in progress");
      const s2 = new State("done now");
      s1.addTransition(new Transition(s2, "finish"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // Spaces are hex-encoded: space = 0x0020
      expect(mermaid).toContain('s_in_0020progress : "in progress"');
      expect(mermaid).toContain('s_done_0020now : "done now"');
      expect(mermaid).toContain("s_in_0020progress --> s_done_0020now");
      // Should not contain raw unquoted names
      expect(mermaid).not.toMatch(/\bin progress\b.*-->/);
    });

    it("should escape double quotes in state names", () => {
      const s1 = new State('say "hello"');
      const s2 = new State("end");
      s1.addTransition(new Transition(s2, "go"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // Quotes and spaces are hex-encoded: " = 0x0022, space = 0x0020
      expect(mermaid).toContain("s_say_0020_0022hello_0022");
      expect(mermaid).not.toContain('"say "hello""');
    });

    it("should produce distinct IDs for names that differ only by special chars", () => {
      const s1 = new State("a-b");
      const s2 = new State("a b");
      s1.addTransition(new Transition(s2, "go"));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // dash = 0x002d, space = 0x0020 — different IDs
      expect(mermaid).toContain("s_a_002db");
      expect(mermaid).toContain("s_a_0020b");
      expect(mermaid).not.toBe(
        mermaid.replace("s_a_002db", "").replace("s_a_0020b", ""),
      );
    });

    it("should escape double quotes in edge labels", () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      const cond = new CallbackCondition('say "hi"', () => true);
      s1.addTransition(new Transition(s2, "go", cond));

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // Quotes in edge labels should be escaped as #quot;
      expect(mermaid).toContain("#quot;");
      expect(mermaid).not.toMatch(/: .*"hi"/);
    });
  });
});
