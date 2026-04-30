import { describe, it, expect } from "vitest";
import { StateCollection } from "../src/StateCollection.js";
import {
  StateNotFoundError,
  StateEventNotFoundError,
  ProcessNotFoundError,
  InvalidSubjectError,
  AmbiguousTransitionError,
} from "../src/error/index.js";
import { ProcessBuilder } from "../src/ProcessBuilder.js";

describe("typed throws", () => {
  describe("StateCollection.getState", () => {
    it("throws StateNotFoundError with stateName and availableStates", () => {
      const process = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .build();
      const states = new StateCollection(process.getStates());
      let caught: unknown;
      try {
        states.getState("missing");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StateNotFoundError);
      const e = caught as StateNotFoundError;
      expect(e.code).toBe("stateNotFound");
      expect(e.stateName).toBe("missing");
      expect([...e.availableStates].sort()).toEqual(["a", "b"]);
      expect(e.message).toContain('"missing"');
    });

    it("reports (none) when collection is empty", () => {
      const states = new StateCollection([]);
      let caught: unknown;
      try {
        states.getState("x");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StateNotFoundError);
      expect((caught as StateNotFoundError).message).toContain("(none)");
    });
  });

  describe("State.getEvent", () => {
    it("throws StateEventNotFoundError with stateName and eventName", () => {
      const process = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addTransition("a", "b", { event: "go" })
        .build();
      const a = process.getState("a");
      let caught: unknown;
      try {
        a.getEvent("nope");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StateEventNotFoundError);
      const e = caught as StateEventNotFoundError;
      expect(e.code).toBe("stateEventNotFound");
      expect(e.stateName).toBe("a");
      expect(e.eventName).toBe("nope");
    });
  });

  describe("AbstractNamedProcessDetector.detectProcess", () => {
    it("throws ProcessNotFoundError with processName and availableProcesses", async () => {
      const { AbstractNamedProcessDetector } =
        await import("../src/factory/AbstractNamedProcessDetector.js");
      class TestDetector extends AbstractNamedProcessDetector<unknown> {
        protected detectProcessName(): string {
          return "missing";
        }
      }
      const proc = new ProcessBuilder("known")
        .addState("s", { initial: true })
        .build();
      const detector = new TestDetector();
      detector.addProcess(proc);
      let caught: unknown;
      try {
        detector.detectProcess({});
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ProcessNotFoundError);
      const e = caught as ProcessNotFoundError;
      expect(e.code).toBe("processNotFound");
      expect(e.processName).toBe("missing");
      expect([...e.availableProcesses]).toEqual(["known"]);
    });
  });

  describe("StatefulStateNameDetector.detectCurrentStateName", () => {
    it("throws InvalidSubjectError listing the missing member", async () => {
      const { StatefulStateNameDetector } =
        await import("../src/factory/StatefulStateNameDetector.js");
      const detector = new StatefulStateNameDetector();
      let caught: unknown;
      try {
        detector.detectCurrentStateName({} as never);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(InvalidSubjectError);
      const e = caught as InvalidSubjectError;
      expect(e.code).toBe("invalidSubject");
      expect(e.expectedInterface).toBe("StatefulInterface");
      expect(e.missingMembers).toEqual(["getCurrentStateName"]);
      // factory.test.ts asserts the message contains "StatefulInterface"
      expect(e.message).toContain("StatefulInterface");
    });
  });

  describe("OneOrNoneActiveTransition.selectTransition", () => {
    it("throws AmbiguousTransitionError with activeCount", async () => {
      const { OneOrNoneActiveTransition } =
        await import("../src/selector/OneOrNoneActiveTransition.js");
      const process = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addState("c")
        .addTransition("a", "b", { event: "go" })
        .addTransition("a", "c", { event: "go2" })
        .build();
      const a = process.getState("a");
      const transitions = Array.from(a.getTransitions());
      const selector = new OneOrNoneActiveTransition();
      let caught: unknown;
      try {
        selector.selectTransition(transitions);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AmbiguousTransitionError);
      const e = caught as AmbiguousTransitionError;
      expect(e.code).toBe("ambiguousTransition");
      expect(e.activeCount).toBe(2);
      // selector.test.ts asserts the message contains "More than one"
      expect(e.message).toContain("More than one");
    });
  });
});
