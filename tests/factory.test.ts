import { describe, it, expect, vi } from "vitest";
import {
  State,
  Transition,
  Process,
  Factory,
  SingleProcessDetector,
  AbstractNamedProcessDetector,
  StatefulStateNameDetector,
} from "../src/index.js";
import type { StatefulInterface, Observer } from "../src/index.js";

describe("SingleProcessDetector", () => {
  it("should always return the same process", () => {
    const process = new Process("test", new State("s1"));
    const detector = new SingleProcessDetector(process);
    expect(detector.detectProcess({})).toBe(process);
    expect(detector.detectProcess("anything")).toBe(process);
  });
});

describe("StatefulStateNameDetector", () => {
  it("should detect state name from stateful subject", () => {
    const subject: StatefulInterface = {
      getCurrentStateName: () => "opened",
      setCurrentStateName: vi.fn(),
    };
    const detector = new StatefulStateNameDetector();
    expect(detector.detectCurrentStateName(subject)).toBe("opened");
  });

  it("should throw for non-stateful subject", () => {
    const detector = new StatefulStateNameDetector();
    expect(() => detector.detectCurrentStateName({} as never)).toThrow(
      "StatefulInterface",
    );
  });
});

describe("Factory", () => {
  it("should create statemachine at initial state", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const process = new Process("test", s1);
    const factory = new Factory(new SingleProcessDetector(process));
    const sm = await factory.createStatemachine({});
    expect(sm.getCurrentState().getName()).toBe("s1");
  });

  it("should create statemachine at detected state", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const process = new Process("test", s1);
    const subject: StatefulInterface = {
      getCurrentStateName: () => "s2",
      setCurrentStateName: vi.fn(),
    };
    const factory = new Factory(
      new SingleProcessDetector(process),
      new StatefulStateNameDetector(),
    );
    const sm = await factory.createStatemachine(subject);
    expect(sm.getCurrentState().getName()).toBe("s2");
  });

  it("should attach observers to created statemachines", async () => {
    const process = new Process("test", new State("s1"));
    const factory = new Factory(new SingleProcessDetector(process));
    const observer: Observer = { update: vi.fn() };
    factory.attachStatemachineObserver(observer);
    const sm = await factory.createStatemachine({});
    // Observer should be attached
    const observers = Array.from(sm.getObservers());
    expect(observers).toContain(observer);
  });

  it("should support detach observer", async () => {
    const process = new Process("test", new State("s1"));
    const factory = new Factory(new SingleProcessDetector(process));
    const observer: Observer = { update: vi.fn() };
    factory.attachStatemachineObserver(observer);
    factory.detachStatemachineObserver(observer);
    const sm = await factory.createStatemachine({});
    const observers = Array.from(sm.getObservers());
    expect(observers).not.toContain(observer);
  });
});

// === PHP-ported tests ===

describe("SingleProcessDetector (PHP-ported)", () => {
  it("should always return the same process", () => {
    const process = new Process("test", new State("new"));
    const detector = new SingleProcessDetector(process);
    const subject = {};
    const result = detector.detectProcess(subject);
    expect(result).toBe(process);
  });
});

class TestNamedProcessDetector extends AbstractNamedProcessDetector {
  private readonly nameDetector: (subject: unknown) => string;

  constructor(nameDetector: (subject: unknown) => string) {
    super();
    this.nameDetector = nameDetector;
  }

  protected detectProcessName(subject: unknown): string {
    return this.nameDetector(subject);
  }
}

describe("AbstractNamedProcessDetector (PHP-ported)", () => {
  it("should detect process by name from subject", () => {
    const processA = new Process("A", new State("new"));
    const processB = new Process("B", new State("new"));

    const detector = new TestNamedProcessDetector(
      (subject: unknown) => (subject as { process: string }).process,
    );
    detector.addProcess(processA);
    detector.addProcess(processB);

    const subjectA = { process: "A" };
    expect(detector.detectProcess(subjectA)).toBe(processA);

    const subjectB = { process: "B" };
    expect(detector.detectProcess(subjectB)).toBe(processB);
  });

  it("should throw for unknown process name", () => {
    const detector = new TestNamedProcessDetector(() => "unknown");
    expect(() => detector.detectProcess({})).toThrow("not found");
  });

  it("should report hasProcess", () => {
    const process = new Process("test", new State("s"));
    const detector = new TestNamedProcessDetector(() => "test");
    expect(detector.hasProcess("test")).toBe(false);
    detector.addProcess(process);
    expect(detector.hasProcess("test")).toBe(true);
  });
});

describe("StatefulStateNameDetector (PHP-ported)", () => {
  it("should return the current state from a stateful object", () => {
    const name = "TestStatus";
    const subject: StatefulInterface = {
      getCurrentStateName: () => name,
      setCurrentStateName: vi.fn(),
    };
    const detector = new StatefulStateNameDetector();
    const result = detector.detectCurrentStateName(subject);
    expect(result).toBe(name);
  });

  it("should throw if object is not stateful", () => {
    const detector = new StatefulStateNameDetector();
    expect(() => detector.detectCurrentStateName({} as never)).toThrow();
  });
});

describe("Factory (PHP-ported)", () => {
  it("should create a statemachine instance for the subject", async () => {
    const initialState = new State("TestState");
    const process = new Process("TestProcess", initialState);
    const detector = new SingleProcessDetector(process);
    const factory = new Factory(detector);
    const sm = await factory.createStatemachine({});
    expect(sm.getCurrentState()).toBeDefined();
    expect(sm.getSubject()).toBeDefined();
  });
});
