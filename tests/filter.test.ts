import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Event,
  ActiveTransitionFilter,
  FilterStateByEvent,
  FilterStateByTransition,
  FilterStateByFinalState,
  FilterTransitionByEvent,
  Tautology,
  Contradiction,
} from "../src/index.js";

describe("ActiveTransitionFilter", () => {
  it("should yield only active transitions", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s1", { event: "go" })
      .addTransition("s1", "s2", { event: "stop" })
      .build();
    const s1 = process.getState("s1");
    const [t1, t2] = Array.from(s1.getTransitions());
    const event = new Event("go");
    const result = await ActiveTransitionFilter.filter(
      [t1!, t2!],
      {},
      new Map(),
      event,
    );
    expect(result).toEqual([t1]);
  });

  it("should filter automatic transitions", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s1", { condition: new Tautology() })
      .addTransition("s1", "s2", { condition: new Contradiction() })
      .build();
    const s1 = process.getState("s1");
    const [t1, t2] = Array.from(s1.getTransitions());
    const result = await ActiveTransitionFilter.filter(
      [t1!, t2!],
      {},
      new Map(),
    );
    expect(result).toEqual([t1]);
  });
});

describe("FilterStateByEvent", () => {
  it("should yield states that have the event", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const s1 = process.getState("s1");
    const s2 = process.getState("s2");
    const result = Array.from(FilterStateByEvent.filter([s1, s2], "go"));
    expect(result).toEqual([s1]);
  });
});

describe("FilterStateByTransition", () => {
  it("should yield states with automatic transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addState("s3")
      .addTransition("s1", "s2") // automatic
      .addTransition("s2", "s3", { event: "go" }) // event-based
      .build();
    const s1 = process.getState("s1");
    const s2 = process.getState("s2");
    const s3 = process.getState("s3");
    const result = Array.from(FilterStateByTransition.filter([s1, s2, s3]));
    expect(result).toEqual([s1]);
  });
});

describe("FilterStateByFinalState", () => {
  it("should yield states with no transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const s1 = process.getState("s1");
    const s2 = process.getState("s2");
    const result = Array.from(FilterStateByFinalState.filter([s1, s2]));
    expect(result).toEqual([s2]);
  });
});

describe("FilterTransitionByEvent", () => {
  it("should yield transitions matching event name", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s1", { event: "go" })
      .addTransition("s1", "s1", { event: "stop" })
      .addTransition("s1", "s2") // automatic
      .build();
    const s1 = process.getState("s1");
    const [t1, t2, t3] = Array.from(s1.getTransitions());
    const result = Array.from(
      FilterTransitionByEvent.filter([t1!, t2!, t3!], "go"),
    );
    expect(result).toEqual([t1]);
  });
});

// === PHP-ported tests ===

describe("FilterStateByEvent (PHP-ported)", () => {
  it("should filter states that have event", () => {
    const process = new ProcessBuilder("p")
      .addState("foo", { initial: true })
      .addState("bar")
      .addTransition("foo", "bar", { event: "event" })
      .build();
    const states = Array.from(process.getStates());
    const result = Array.from(FilterStateByEvent.filter(states, "event"));
    const foo = process.getState("foo");
    const bar = process.getState("bar");
    expect(result).toContainEqual(foo);
    expect(result).not.toContainEqual(bar);
  });
});

describe("FilterStateByFinalState (PHP-ported)", () => {
  it("should filter states that have no outgoing transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("foo", { initial: true })
      .addState("bar")
      .addTransition("foo", "bar", { event: "event" })
      .build();
    const states = Array.from(process.getStates());
    const result = Array.from(FilterStateByFinalState.filter(states));
    const foo = process.getState("foo");
    const bar = process.getState("bar");
    expect(result).toContainEqual(bar);
    expect(result).not.toContainEqual(foo);
  });
});

describe("FilterStateByTransition (PHP-ported)", () => {
  it("should filter states that have transitions without an event", () => {
    const process = new ProcessBuilder("p")
      .addState("foo", { initial: true })
      .addState("bar")
      .addState("baz")
      .addTransition("foo", "bar", { event: "event" })
      .addTransition("bar", "baz", { condition: new Tautology("condition") })
      .build();
    const states = Array.from(process.getStates());
    const result = Array.from(FilterStateByTransition.filter(states));
    const foo = process.getState("foo");
    const bar = process.getState("bar");
    const baz = process.getState("baz");
    expect(result).not.toContainEqual(foo);
    expect(result).toContainEqual(bar);
    expect(result).not.toContainEqual(baz);
  });
});
