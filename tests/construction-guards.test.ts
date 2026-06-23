import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Process,
  State,
  Transition,
  Event,
  CallbackObserver,
} from "../src/index.js";
import { INTERNAL_CONSTRUCTION_KEY } from "../src/internal/InternalConstruction.js";

const BOGUS_KEY: typeof INTERNAL_CONSTRUCTION_KEY = Symbol(
  "bogus",
) as unknown as typeof INTERNAL_CONSTRUCTION_KEY;

const buildProcess = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();

describe("internal construction guards", () => {
  it("Process is not user-constructible without the internal key", () => {
    const state = buildProcess().getState("a");
    expect(() => new Process(BOGUS_KEY, "p", state, [state])).toThrow(
      "not user-constructible",
    );
  });

  it("Transition is not user-constructible without the internal key", () => {
    const state = buildProcess().getState("b");
    expect(() => new Transition(BOGUS_KEY, state, null, null, 1)).toThrow(
      "not user-constructible",
    );
  });

  it("State._initTransitions rejects a wrong key", () => {
    const state = new State(INTERNAL_CONSTRUCTION_KEY, "x", [], new Map());
    expect(() => state._initTransitions(BOGUS_KEY, [])).toThrow("internal");
  });

  it("State._initTransitions rejects a second initialization", () => {
    const state = buildProcess().getState("a") as State;
    expect(() => state._initTransitions(INTERNAL_CONSTRUCTION_KEY, [])).toThrow(
      "already set",
    );
  });

  it("State.getTransitions returns an empty iterable before initialization", () => {
    const state = new State(INTERNAL_CONSTRUCTION_KEY, "x", [], new Map());
    expect(Array.from(state.getTransitions())).toEqual([]);
  });
});

describe("deprecated Event.getInvokeArgs contract", () => {
  it("always returns [], including while an invoke is in flight", async () => {
    const event = new Event("e");
    expect(event.getInvokeArgs()).toEqual([]);

    let duringInvoke: unknown[] | null = null;
    event.attach(
      new CallbackObserver(() => {
        duringInvoke = event.getInvokeArgs();
      }),
    );
    await event.invoke("subject", "context");
    // The args reached the observer via update(subject, args); the deprecated
    // event-level accessor stays empty even mid-invoke.
    expect(duringInvoke).toEqual([]);
    expect(event.getInvokeArgs()).toEqual([]);
  });
});
