import { describe, it, expect } from "vitest";
import {
  WrongEventForStateError,
  LockCanNotBeAcquiredError,
  DuplicateStateError,
  ProcessFinalizedError,
  GraphValidationError,
  DuplicateTransitionError,
  State,
  StateCollection,
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

  it("should be thrown by StateCollection.addState on duplicate name", () => {
    const collection = new StateCollection();
    collection.addState(new State("s1"));
    expect(() => collection.addState(new State("s1"))).toThrow(
      DuplicateStateError,
    );
  });

  it("should allow re-adding the same instance", () => {
    const collection = new StateCollection();
    const s1 = new State("s1");
    collection.addState(s1);
    expect(() => collection.addState(s1)).not.toThrow();
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
});
