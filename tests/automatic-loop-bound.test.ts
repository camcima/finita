import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  CallbackCondition,
  AutomaticTransitionCycleError,
} from "../src/index.js";

describe("automatic transition loops", () => {
  it("allows a condition-terminated loop to run to completion", async () => {
    // check --auto(retries>0)--> work; work --auto--> check;
    // check --auto(retries==0)--> done. The retries counter decrements as the
    // condition is evaluated, so the loop terminates after a few rounds.
    let retries = 3;
    const hasRetries = new CallbackCondition<unknown>(
      "hasRetries",
      () => retries-- > 0,
    );
    const exhausted = new CallbackCondition<unknown>(
      "exhausted",
      () => retries < 0,
    );

    const process = new ProcessBuilder("p")
      .addState("check", { initial: true })
      .addState("work")
      .addState("done")
      .addTransition("check", "work", { condition: hasRetries })
      .addTransition("work", "check")
      .addTransition("check", "done", { condition: exhausted })
      .build();

    const sm = new Statemachine({}, process);
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("done");
  });

  it("throws AutomaticTransitionCycleError after maxAutomaticHops on a genuine infinite loop", async () => {
    const process = new ProcessBuilder("p")
      .addState("x", { initial: true })
      .addState("y")
      .addTransition("x", "y")
      .addTransition("y", "x")
      .build();

    const sm = new Statemachine({}, process, { maxAutomaticHops: 10 });
    await expect(sm.checkTransitions()).rejects.toBeInstanceOf(
      AutomaticTransitionCycleError,
    );
  });
});
