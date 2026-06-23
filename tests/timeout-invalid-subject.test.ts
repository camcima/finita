import { describe, it, expect } from "vitest";
import { Timeout, InvalidSubjectError } from "../src/index.js";

describe("Timeout subject validation", () => {
  it("throws InvalidSubjectError (not a plain Error) for a subject without the interface", () => {
    const timeout = new Timeout(1000);
    expect(() => timeout.checkCondition({}, new Map())).toThrow(
      InvalidSubjectError,
    );
  });

  it("compares against the timeout numerically", () => {
    const timeout = new Timeout(1000);
    const past = {
      getLastStateHasChangedDate: () => new Date(Date.now() - 5000),
    };
    const recent = { getLastStateHasChangedDate: () => new Date() };
    expect(timeout.checkCondition(past, new Map())).toBe(true);
    expect(timeout.checkCondition(recent, new Map())).toBe(false);
  });
});
