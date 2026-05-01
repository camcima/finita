import { describe, it, expect } from "vitest";
import {
  FinitaError,
  DuplicateStateError,
  DuplicateTransitionError,
  GraphValidationError,
  LockCanNotBeAcquiredError,
  ProcessFinalizedError,
  WrongEventForStateError,
} from "../src/error/index.js";

describe("FinitaError hierarchy (existing classes)", () => {
  it("FinitaError is abstract and not instantiable directly", () => {
    // @ts-expect-error abstract
    expect(() => new FinitaError("nope")).toThrow();
  });

  const cases: Array<{ name: string; instance: FinitaError; code: string }> = [
    {
      name: "DuplicateStateError",
      instance: new DuplicateStateError("s"),
      code: "duplicateState",
    },
    {
      name: "DuplicateTransitionError",
      instance: new DuplicateTransitionError({
        fromState: "a",
        toState: "b",
        eventName: "go",
        existingConditionName: null,
        newConditionName: "c",
      }),
      code: "duplicateTransition",
    },
    {
      name: "GraphValidationError",
      instance: new GraphValidationError("unknownSource", "msg", {}),
      code: "unknownSource",
    },
    {
      name: "LockCanNotBeAcquiredError",
      instance: new LockCanNotBeAcquiredError(),
      code: "lockCanNotBeAcquired",
    },
    {
      name: "ProcessFinalizedError",
      instance: new ProcessFinalizedError("p"),
      code: "processFinalized",
    },
    {
      name: "WrongEventForStateError",
      instance: new WrongEventForStateError("s", "e"),
      code: "wrongEventForState",
    },
  ];

  for (const { name, instance, code } of cases) {
    it(`${name} extends FinitaError and Error`, () => {
      expect(instance).toBeInstanceOf(Error);
      expect(instance).toBeInstanceOf(FinitaError);
      expect(instance.name).toBe(name);
      expect(instance.code).toBe(code);
    });
  }

  it("all codes are unique across the existing hierarchy", () => {
    const codes = cases.map((c) => c.instance.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
