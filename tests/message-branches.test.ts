import { describe, it, expect, vi } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  TransitionLogger,
  Tautology,
  DuplicateTransitionError,
  InvalidSubjectError,
} from "../src/index.js";
import type { LoggerInterface } from "../src/index.js";

describe("TransitionLogger message variants", () => {
  const lastMessage = (logger: LoggerInterface): string =>
    (logger.log as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;

  it("logs an automatic transition without a condition (no 'with' clause)", async () => {
    const logger: LoggerInterface = { log: vi.fn() };
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b") // automatic, no condition
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new TransitionLogger(logger));
    await sm.checkTransitions();

    const message = lastMessage(logger);
    expect(message).toContain('from "a" to "b"');
    expect(message).not.toContain(" with");
  });

  it("logs an automatic transition with a condition (condition clause, no event clause)", async () => {
    const logger: LoggerInterface = { log: vi.fn() };
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { condition: new Tautology() })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new TransitionLogger(logger));
    await sm.checkTransitions();

    const message = lastMessage(logger);
    expect(message).toContain("with condition");
    expect(message).not.toContain("event");
  });
});

describe("DuplicateTransitionError weight clause variants", () => {
  const base = {
    fromState: "a",
    toState: "b",
    eventName: "go",
    existingConditionName: null,
    newConditionName: null,
  };

  it("omits the weight clause when both weights are equal", () => {
    const err = new DuplicateTransitionError({
      ...base,
      existingWeight: 3,
      newWeight: 3,
    });
    expect(err.message).not.toContain("weight");
  });

  it("omits the weight clause when only one weight is provided", () => {
    const existingOnly = new DuplicateTransitionError({
      ...base,
      existingWeight: 3,
    });
    expect(existingOnly.message).not.toContain("weight");

    const newOnly = new DuplicateTransitionError({ ...base, newWeight: 10 });
    expect(newOnly.message).not.toContain("weight");
  });
});

describe("DuplicateTransitionError automatic-transition label", () => {
  it("labels a null eventName as <automatic> in the message", () => {
    const err = new DuplicateTransitionError({
      fromState: "a",
      toState: "b",
      eventName: null,
      existingConditionName: "x",
      newConditionName: "y",
    });
    expect(err.message).toContain('on event "<automatic>"');
  });
});

describe("InvalidSubjectError member list fallback", () => {
  it("renders '(unknown)' when no missing members are provided", () => {
    const err = new InvalidSubjectError("SomeInterface", []);
    expect(err.message).toContain("(unknown)");
    expect(err.missingMembers).toEqual([]);
  });
});

describe("ProcessBuilder orphan validation revisits", () => {
  it("handles diamond graphs where a state is reachable via two paths", () => {
    // a→b, a→c, b→d, c→d: d is enqueued twice during the reachability
    // walk; the second visit must be skipped, not re-expanded.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addState("d")
      .addTransition("a", "b", { event: "left" })
      .addTransition("a", "c", { event: "right" })
      .addTransition("b", "d", { event: "go" })
      .addTransition("c", "d", { event: "go" })
      .build({ strictOrphans: true });
    expect(process.getState("d").getName()).toBe("d");
  });
});
