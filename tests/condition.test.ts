import { describe, it, expect } from "vitest";
import {
  Tautology,
  Contradiction,
  CallbackCondition,
  Timeout,
  AndComposite,
  OrComposite,
  Not,
} from "../src/index.js";

const ctx = () => new Map<string, unknown>();

describe("Tautology", () => {
  it("should always return true", () => {
    const t = new Tautology();
    expect(t.checkCondition({}, ctx())).toBe(true);
    expect(t.getName()).toBe("Tautology");
  });
});

describe("Contradiction", () => {
  it("should always return false", () => {
    const c = new Contradiction();
    expect(c.checkCondition({}, ctx())).toBe(false);
    expect(c.getName()).toBe("Contradiction");
  });
});

describe("CallbackCondition", () => {
  it("should delegate to callback", () => {
    const cond = new CallbackCondition(
      "isPositive",
      (subject) => (subject as number) > 0,
    );
    expect(cond.checkCondition(5, ctx())).toBe(true);
    expect(cond.checkCondition(-1, ctx())).toBe(false);
    expect(cond.getName()).toBe("isPositive");
  });

  it("should receive context", () => {
    const cond = new CallbackCondition("hasKey", (_s, context) =>
      context.has("flag"),
    );
    const c = new Map<string, unknown>([["flag", true]]);
    expect(cond.checkCondition(null, c)).toBe(true);
    expect(cond.checkCondition(null, ctx())).toBe(false);
  });

  it("should support async callbacks", async () => {
    const cond = new CallbackCondition("asyncCheck", async () => {
      return true;
    });
    expect(await cond.checkCondition({}, ctx())).toBe(true);
  });
});

describe("Timeout", () => {
  it("should return true when timeout has elapsed", () => {
    const pastDate = new Date(Date.now() - 10000);
    const subject = { getLastStateHasChangedDate: () => pastDate };
    const timeout = new Timeout(5000);
    expect(timeout.checkCondition(subject, ctx())).toBe(true);
    expect(timeout.getName()).toBe("Timeout: 5000ms");
  });

  it("should return false when timeout has not elapsed", () => {
    const recentDate = new Date();
    const subject = { getLastStateHasChangedDate: () => recentDate };
    const timeout = new Timeout(60000);
    expect(timeout.checkCondition(subject, ctx())).toBe(false);
  });

  it("should throw for non-implementing subject", () => {
    const timeout = new Timeout(1000);
    expect(() => timeout.checkCondition({}, ctx())).toThrow(
      "LastStateHasChangedDateInterface",
    );
  });

  it("should support custom label", () => {
    const timeout = new Timeout(86400000, "1 day");
    expect(timeout.getName()).toBe("Timeout: 1 day");
  });
});

describe("AndComposite", () => {
  it("should return true when all conditions are true", async () => {
    const and = new AndComposite(new Tautology("A"));
    and.addAnd(new Tautology("B"));
    expect(await and.checkCondition({}, ctx())).toBe(true);
    expect(and.getName()).toBe("(A and B)");
  });

  it("should return false when any condition is false", async () => {
    const and = new AndComposite(new Tautology("A"));
    and.addAnd(new Contradiction("B"));
    expect(await and.checkCondition({}, ctx())).toBe(false);
  });

  it("should short-circuit on first false", async () => {
    let called = false;
    const lazy = new CallbackCondition("lazy", () => {
      called = true;
      return true;
    });
    const and = new AndComposite(new Contradiction("first"));
    and.addAnd(lazy);
    await and.checkCondition({}, ctx());
    expect(called).toBe(false);
  });
});

describe("OrComposite", () => {
  it("should return true when any condition is true", async () => {
    const or = new OrComposite(new Contradiction("A"));
    or.addOr(new Tautology("B"));
    expect(await or.checkCondition({}, ctx())).toBe(true);
    expect(or.getName()).toBe("(A or B)");
  });

  it("should return false when all conditions are false", async () => {
    const or = new OrComposite(new Contradiction("A"));
    or.addOr(new Contradiction("B"));
    expect(await or.checkCondition({}, ctx())).toBe(false);
  });

  it("should short-circuit on first true", async () => {
    let called = false;
    const lazy = new CallbackCondition("lazy", () => {
      called = true;
      return false;
    });
    const or = new OrComposite(new Tautology("first"));
    or.addOr(lazy);
    await or.checkCondition({}, ctx());
    expect(called).toBe(false);
  });
});

describe("Not", () => {
  it("should negate true to false", async () => {
    const not = new Not(new Tautology("A"));
    expect(await not.checkCondition({}, ctx())).toBe(false);
    expect(not.getName()).toBe("not ( A )");
  });

  it("should negate false to true", async () => {
    const not = new Not(new Contradiction("A"));
    expect(await not.checkCondition({}, ctx())).toBe(true);
  });
});

// === PHP-ported tests ===

describe("Tautology (PHP-ported)", () => {
  it("should have a name", () => {
    const t = new Tautology("TestCondition");
    expect(typeof t.getName()).toBe("string");
    expect(t.getName().length).toBeGreaterThan(0);
  });

  it("should always be true with subject and context", () => {
    const t = new Tautology("TestCondition");
    expect(t.checkCondition({}, ctx())).toBe(true);
  });
});

describe("Contradiction (PHP-ported)", () => {
  it("should have a name", () => {
    const c = new Contradiction("TestCondition");
    expect(typeof c.getName()).toBe("string");
    expect(c.getName().length).toBeGreaterThan(0);
  });

  it("should always be false with subject and context", () => {
    const c = new Contradiction("TestCondition");
    expect(c.checkCondition({}, ctx())).toBe(false);
  });
});

describe("CallbackCondition (PHP-ported)", () => {
  it("should convert callable to condition and call it", () => {
    let wasCalled = false;
    const cond = new CallbackCondition("TestCondition", () => {
      wasCalled = true;
      return true;
    });
    const result = cond.checkCondition({}, ctx());
    expect(wasCalled).toBe(true);
    expect(result).toBe(true);
  });
});

describe("Timeout (PHP-ported)", () => {
  it("should stay false until last state changed date has reached timeout interval", () => {
    const timeout = new Timeout(7 * 24 * 60 * 60 * 1000, "1 week"); // 1 week in ms
    const subject = { getLastStateHasChangedDate: () => new Date() };
    expect(timeout.checkCondition(subject, ctx())).toBe(false);
  });

  it("should become true after last state changed date has reached timeout interval", () => {
    const timeout = new Timeout(7 * 24 * 60 * 60 * 1000, "1 week");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const subject = { getLastStateHasChangedDate: () => oneWeekAgo };
    expect(timeout.checkCondition(subject, ctx())).toBe(true);
  });
});

describe("AndComposite (PHP-ported)", () => {
  it("should combine inner conditions with AND", async () => {
    const and = new AndComposite(new Tautology("TestCondition"));
    expect(await and.checkCondition({}, ctx())).toBe(true);
    and.addAnd(new Contradiction("Other Condition"));
    expect(await and.checkCondition({}, ctx())).toBe(false);
  });
});

describe("OrComposite (PHP-ported)", () => {
  it("should combine inner conditions with OR", async () => {
    const or = new OrComposite(new Contradiction("TestCondition"));
    expect(await or.checkCondition({}, ctx())).toBe(false);
    or.addOr(new Tautology("Other Condition"));
    expect(await or.checkCondition({}, ctx())).toBe(true);
  });
});

describe("Not (PHP-ported)", () => {
  it("should inverse the inner condition", async () => {
    const not = new Not(new Tautology("TestCondition"));
    expect(await not.checkCondition({}, ctx())).toBe(false);
  });
});
