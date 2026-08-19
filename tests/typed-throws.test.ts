import { describe, it, expect } from "vitest";
import { StateCollection } from "../src/StateCollection.js";
import {
  StateNotFoundError,
  StateEventNotFoundError,
  ProcessNotFoundError,
  InvalidSubjectError,
  AmbiguousTransitionError,
  AutomaticTransitionCycleError,
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

    it("carries the candidate transitions that caused the ambiguity", async () => {
      const { OneOrNoneActiveTransition } =
        await import("../src/selector/OneOrNoneActiveTransition.js");
      const { CallbackCondition } =
        await import("../src/condition/CallbackCondition.js");
      const process = new ProcessBuilder("p")
        .addState("a", { initial: true })
        .addState("b")
        .addState("c")
        .addTransition("a", "b", { event: "go" })
        .addTransition("a", "c", {
          event: "go",
          condition: new CallbackCondition("isVip", () => true),
          weight: 7,
        })
        .build();
      const transitions = Array.from(process.getState("a").getTransitions());
      let caught: unknown;
      try {
        new OneOrNoneActiveTransition().selectTransition(transitions);
      } catch (err) {
        caught = err;
      }
      const e = caught as AmbiguousTransitionError;
      // Debugging an ambiguity needs the candidates, not just how many.
      expect(e.candidates.map((c) => c.targetStateName).sort()).toEqual([
        "b",
        "c",
      ]);
      expect(e.candidates).toContainEqual({
        targetStateName: "c",
        eventName: "go",
        conditionName: "isVip",
        weight: 7,
      });
      expect(e.message).toContain('"b"');
      expect(e.message).toContain('"c"');
      expect(e.message).toContain("isVip");
      expect(Object.isFrozen(e.candidates)).toBe(true);
    });

    it("omits the candidate detail when constructed without candidates", () => {
      // The candidates argument is optional so that a custom
      // TransitionSelectorInterface can still raise this error with only a
      // count, exactly as it could before candidates existed.
      const e = new AmbiguousTransitionError(3);
      expect(e.activeCount).toBe(3);
      expect(e.candidates).toEqual([]);
      expect(e.message).toBe(
        "More than one transition is active! (active count: 3)",
      );
    });
  });

  describe("Statemachine automatic-cycle detection", () => {
    it("throws AutomaticTransitionCycleError with stateName and hopLimit after exceeding maxAutomaticHops", async () => {
      const { Statemachine } = await import("../src/Statemachine.js");
      const process = new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2") // automatic
        .addTransition("s2", "s1") // automatic
        .build();
      // Use a low hop limit so the test runs fast.
      const sm = new Statemachine({}, process, { maxAutomaticHops: 5 });
      let caught: unknown;
      try {
        await sm.checkTransitions();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AutomaticTransitionCycleError);
      const e = caught as AutomaticTransitionCycleError;
      expect(e.code).toBe("automaticTransitionCycle");
      expect(typeof e.stateName).toBe("string");
      expect(typeof e.hopLimit).toBe("number");
      expect(e.hopLimit).toBe(5);
      expect(e.message).toContain("exceeded 5 hops");
    });
  });
});
