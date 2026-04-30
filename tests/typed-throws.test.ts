import { describe, it, expect } from "vitest";
import { StateCollection } from "../src/StateCollection.js";
import {
  StateNotFoundError,
  StateEventNotFoundError,
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
});
