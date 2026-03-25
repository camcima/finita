import { describe, it, expect } from "vitest";
import {
  State,
  Transition,
  Event,
  StateCollection,
  SetupHelper,
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
    const s1 = new State("s1");
    const s2 = new State("s2");
    const t1 = new Transition(s1, "go");
    const t2 = new Transition(s2, "stop");
    const event = new Event("go");
    const result = await ActiveTransitionFilter.filter(
      [t1, t2],
      {},
      new Map(),
      event,
    );
    expect(result).toEqual([t1]);
  });

  it("should filter automatic transitions", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const t1 = new Transition(s1, null, new Tautology());
    const t2 = new Transition(s2, null, new Contradiction());
    const result = await ActiveTransitionFilter.filter([t1, t2], {}, new Map());
    expect(result).toEqual([t1]);
  });
});

describe("FilterStateByEvent", () => {
  it("should yield states that have the event", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const result = Array.from(FilterStateByEvent.filter([s1, s2], "go"));
    expect(result).toEqual([s1]);
  });
});

describe("FilterStateByTransition", () => {
  it("should yield states with automatic transitions", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const s3 = new State("s3");
    s1.addTransition(new Transition(s2)); // automatic
    s2.addTransition(new Transition(s3, "go")); // event-based
    const result = Array.from(FilterStateByTransition.filter([s1, s2, s3]));
    expect(result).toEqual([s1]);
  });
});

describe("FilterStateByFinalState", () => {
  it("should yield states with no transitions", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const result = Array.from(FilterStateByFinalState.filter([s1, s2]));
    expect(result).toEqual([s2]);
  });
});

describe("FilterTransitionByEvent", () => {
  it("should yield transitions matching event name", () => {
    const s1 = new State("s1");
    const t1 = new Transition(s1, "go");
    const t2 = new Transition(s1, "stop");
    const t3 = new Transition(s1); // automatic
    const result = Array.from(
      FilterTransitionByEvent.filter([t1, t2, t3], "go"),
    );
    expect(result).toEqual([t1]);
  });
});

// === PHP-ported tests ===

describe("FilterStateByEvent (PHP-ported)", () => {
  it("should filter states that have event (using SetupHelper)", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    helper.findOrCreateTransition("foo", "bar", "event");

    const states = Array.from(collection.getStates());
    const result = Array.from(FilterStateByEvent.filter(states, "event"));

    expect(result).toContainEqual(collection.getState("foo"));
    expect(result).not.toContainEqual(collection.getState("bar"));
  });
});

describe("FilterStateByFinalState (PHP-ported)", () => {
  it("should filter states that have no outgoing transitions (using SetupHelper)", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    helper.findOrCreateTransition("foo", "bar", "event");

    const states = Array.from(collection.getStates());
    const result = Array.from(FilterStateByFinalState.filter(states));

    expect(result).toContainEqual(collection.getState("bar"));
    expect(result).not.toContainEqual(collection.getState("foo"));
  });
});

describe("FilterStateByTransition (PHP-ported)", () => {
  it("should filter states that have transitions without an event (using SetupHelper)", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    helper.findOrCreateTransition("foo", "bar", "event");
    helper.findOrCreateTransition(
      "bar",
      "baz",
      null,
      new Tautology("condition"),
    );

    const states = Array.from(collection.getStates());
    const result = Array.from(FilterStateByTransition.filter(states));

    expect(result).not.toContainEqual(collection.getState("foo"));
    expect(result).toContainEqual(collection.getState("bar"));
    expect(result).not.toContainEqual(collection.getState("baz"));
  });
});
