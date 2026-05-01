import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  GraphBuilder,
  CallbackCondition,
} from "../src/index.js";

describe("GraphBuilder", () => {
  it("should build graph from states", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s2", "s1", { event: "back" })
      .build();
    const s1 = process.getState("s1");
    const s2 = process.getState("s2");

    const builder = new GraphBuilder();
    builder.addState(s1);
    builder.addState(s2);

    const graph = builder.getGraph();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["s1", "s2"]);
  });

  it("should include transition labels", () => {
    const cond = new CallbackCondition("isReady", () => true);
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go", condition: cond })
      .build();
    const s1 = process.getState("s1");

    const builder = new GraphBuilder();
    builder.addState(s1);

    const graph = builder.getGraph();
    expect(graph.edges[0].label).toContain("E: go");
    expect(graph.edges[0].label).toContain("IF: isReady");
    expect(graph.edges[0].label).toContain("W: 1");
  });

  it("should handle addStateCollection", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();

    const builder = new GraphBuilder();
    // Use addStates with the process's states iterable
    builder.addStates(Array.from(process.getStates()));

    const graph = builder.getGraph();
    expect(graph.nodes).toHaveLength(2);
  });

  it("should not duplicate nodes", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s2", "s1", { event: "back" })
      .build();
    const s1 = process.getState("s1");
    const s2 = process.getState("s2");

    const builder = new GraphBuilder();
    builder.addStates([s1, s2]);

    const graph = builder.getGraph();
    expect(graph.nodes).toHaveLength(2);
  });

  describe("toDot", () => {
    it("should produce valid DOT output", () => {
      const process = new ProcessBuilder("p")
        .addState("new", { initial: true })
        .addState("shipped")
        .addTransition("new", "shipped", { event: "ship" })
        .build();
      const s1 = process.getState("new");

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
      const process = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .build();
      const s1 = process.getState("a");

      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot({ rankdir: "TB" });
      expect(dot).toContain("rankdir=TB;");
    });

    it("should escape double quotes in labels", () => {
      const process = new ProcessBuilder("p")
        .addState('state "one"', { initial: true })
        .addState('state "two"')
        .addTransition('state "one"', 'state "two"', { event: "go" })
        .build();
      const s1 = process.getState('state "one"');

      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot();
      expect(dot).toContain('state \\"one\\"');
      expect(dot).toContain('state \\"two\\"');
    });

    it("should include condition and event in edge labels", () => {
      const cond = new CallbackCondition("isReady", () => true);
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go", condition: cond })
        .build();
      const s1 = process.getState("s1");

      const builder = new GraphBuilder();
      builder.addState(s1);

      const dot = builder.toDot();
      expect(dot).toContain("E: go");
      expect(dot).toContain("IF: isReady");
    });
  });

  describe("toMermaid", () => {
    it("should produce valid Mermaid stateDiagram output", () => {
      const process = new ProcessBuilder("p")
        .addState("new", { initial: true })
        .addState("shipped")
        .addTransition("new", "shipped", { event: "ship" })
        .build();
      const s1 = process.getState("new");

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
      const process = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "go" })
        .build();
      const s1 = process.getState("a");

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid({ direction: "TB" });
      expect(mermaid).toContain("direction TB");
    });

    it("should join multiline labels with separator", () => {
      const cond = new CallbackCondition("isReady", () => true);
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go", condition: cond })
        .build();
      const s1 = process.getState("s1");

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // The multiline label (E: go\nIF: isReady\nW: 1) should be joined with " / "
      expect(mermaid).toContain("s_s1 --> s_s2 : E: go / IF: isReady / W: 1");
    });

    it("should handle automatic transitions (no event)", () => {
      const cond = new CallbackCondition("timeout", () => true);
      const process = new ProcessBuilder("p")
        .addState("active", { initial: true })
        .addState("expired")
        .addTransition("active", "expired", { condition: cond })
        .build();
      const s1 = process.getState("active");

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      expect(mermaid).toContain("s_active --> s_expired : IF: timeout / W: 1");
    });

    it("should handle state names with spaces and punctuation", () => {
      const process = new ProcessBuilder("p")
        .addState("in progress", { initial: true })
        .addState("done now")
        .addTransition("in progress", "done now", { event: "finish" })
        .build();
      const s1 = process.getState("in progress");

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
      const process = new ProcessBuilder("p")
        .addState('say "hello"', { initial: true })
        .addState("end")
        .addTransition('say "hello"', "end", { event: "go" })
        .build();
      const s1 = process.getState('say "hello"');

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // Quotes and spaces are hex-encoded: " = 0x0022, space = 0x0020
      expect(mermaid).toContain("s_say_0020_0022hello_0022");
      expect(mermaid).not.toContain('"say "hello""');
    });

    it("should produce distinct IDs for names that differ only by special chars", () => {
      const process = new ProcessBuilder("p")
        .addState("a-b", { initial: true })
        .addState("a b")
        .addTransition("a-b", "a b", { event: "go" })
        .build();
      const s1 = process.getState("a-b");

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
      const cond = new CallbackCondition('say "hi"', () => true);
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go", condition: cond })
        .build();
      const s1 = process.getState("s1");

      const builder = new GraphBuilder();
      builder.addState(s1);

      const mermaid = builder.toMermaid();
      // Quotes in edge labels should be escaped as #quot;
      expect(mermaid).toContain("#quot;");
      expect(mermaid).not.toMatch(/: .*"hi"/);
    });
  });

  describe("event observers in transition labels", () => {
    it('renders Named observers attached to events as "C: name"', () => {
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        .build();
      const s1 = process.getState("s1");
      const namedObserver = {
        getName(): string {
          return "auditCommand";
        },
        update(): void {},
      };
      s1.getEvent("go").attach(namedObserver);

      const builder = new GraphBuilder();
      builder.addState(s1);

      const graph = builder.getGraph();
      expect(graph.edges[0].label).toContain("E: go");
      expect(graph.edges[0].label).toContain("C: auditCommand");
    });

    it("renders multiple observers in attach order, joined by comma", () => {
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        .build();
      const s1 = process.getState("s1");
      s1.getEvent("go").attach({
        getName: () => "first",
        update: () => {},
      });
      s1.getEvent("go").attach({
        getName: () => "second",
        update: () => {},
      });

      const builder = new GraphBuilder();
      builder.addState(s1);

      const graph = builder.getGraph();
      expect(graph.edges[0].label).toContain("C: first, second");
    });

    it("falls back to String(obj) for observers that don't expose getName", () => {
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        .build();
      const s1 = process.getState("s1");
      const unnamedObserver = {
        toString(): string {
          return "anon-observer";
        },
        update(): void {},
      };
      s1.getEvent("go").attach(unnamedObserver);

      const builder = new GraphBuilder();
      builder.addState(s1);

      const graph = builder.getGraph();
      expect(graph.edges[0].label).toContain("C: anon-observer");
    });
  });
});
