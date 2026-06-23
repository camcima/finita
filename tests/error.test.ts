import { describe, it, expect } from "vitest";
import {
  WrongEventForStateError,
  LockCanNotBeAcquiredError,
  DuplicateStateError,
  ProcessFinalizedError,
  GraphValidationError,
  DuplicateTransitionError,
  ProcessBuilder,
} from "../src/index.js";

describe("WrongEventForStateError (PHP-ported)", () => {
  it("should have accessible stateName", () => {
    const error = new WrongEventForStateError("stateName", "eventName");
    expect(error.stateName).toBe("stateName");
  });

  it("should have accessible eventName", () => {
    const error = new WrongEventForStateError("stateName", "eventName");
    expect(error.eventName).toBe("eventName");
  });

  it("should include state and event in message", () => {
    const error = new WrongEventForStateError("closed", "fly");
    expect(error.message).toContain("closed");
    expect(error.message).toContain("fly");
  });
});

describe("LockCanNotBeAcquiredError", () => {
  it("should be an Error", () => {
    const error = new LockCanNotBeAcquiredError("test");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("test");
  });
});

describe("DuplicateStateError", () => {
  it("should have accessible stateName", () => {
    const error = new DuplicateStateError("myState");
    expect(error.stateName).toBe("myState");
  });

  it("should include state name in message", () => {
    const error = new DuplicateStateError("myState");
    expect(error.message).toContain("myState");
    expect(error.name).toBe("DuplicateStateError");
  });

  it("should be thrown by ProcessBuilder.addState on duplicate name", () => {
    expect(() => new ProcessBuilder("p").addState("s1").addState("s1")).toThrow(
      DuplicateStateError,
    );
  });

  it("should include the duplicate state name in the error message", () => {
    try {
      new ProcessBuilder("p").addState("s1").addState("s1");
    } catch (err) {
      expect((err as DuplicateStateError).stateName).toBe("s1");
    }
  });
});

describe("ProcessFinalizedError", () => {
  it("captures the builder name and is an Error", () => {
    const err = new ProcessFinalizedError("orderFulfillment");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProcessFinalizedError");
    expect(err.processName).toBe("orderFulfillment");
    expect(err.message).toContain("orderFulfillment");
  });
});

describe("GraphValidationError", () => {
  it("captures violation details", () => {
    const err = new GraphValidationError(
      "unknownTarget",
      `Transition target "x" was not declared as a state`,
      { fromState: "a", toState: "x" },
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GraphValidationError");
    expect(err.code).toBe("unknownTarget");
    expect(err.message).toContain("unknownTarget");
    expect(err.message).toContain('"x"');
    expect(err.details).toEqual({ fromState: "a", toState: "x" });
  });
});

describe("DuplicateTransitionError", () => {
  it("captures conflict descriptors", () => {
    const err = new DuplicateTransitionError({
      fromState: "draft",
      toState: "submitted",
      eventName: "submit",
      existingConditionName: "hasItems",
      newConditionName: "isAuthorised",
    });
    expect(err.name).toBe("DuplicateTransitionError");
    expect(err.message).toContain("draft");
    expect(err.message).toContain("submit");
    expect(err.message).toContain("hasItems");
    expect(err.message).toContain("isAuthorised");
  });

  it("includes a weight clause only when conflicting weights are provided", () => {
    const withWeights = new DuplicateTransitionError({
      fromState: "a",
      toState: "b",
      eventName: "go",
      existingConditionName: null,
      newConditionName: null,
      existingWeight: 1,
      newWeight: 10,
    });
    expect(withWeights.message).toContain("existing weight 1 vs new weight 10");

    const withoutWeights = new DuplicateTransitionError({
      fromState: "a",
      toState: "b",
      eventName: "go",
      existingConditionName: null,
      newConditionName: null,
    });
    expect(withoutWeights.message).not.toContain("weight");
  });
});
