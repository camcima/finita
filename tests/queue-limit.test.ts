import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  QueueLimitExceededError,
} from "../src/index.js";
import type { ConditionInterface } from "../src/index.js";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("maxQueueLength", () => {
  it("rejects operations beyond the configured queue length", async () => {
    const gate = deferred();
    const slow: ConditionInterface = {
      getName: () => "slow",
      checkCondition: async () => {
        await gate.promise;
        return true;
      },
    };
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", condition: slow })
      .build();
    const sm = new Statemachine({}, process, { maxQueueLength: 1 });

    const first = sm.triggerEvent("go"); // dequeued immediately; blocked on the gate
    const second = sm.triggerEvent("go"); // waits in the queue (size 1 == limit)
    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
      QueueLimitExceededError,
    );

    gate.resolve();
    await first;
    // second runs from state b, where "go" is not a valid event.
    await second.catch(() => undefined);
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("rejects invalid maxQueueLength values at construction", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .build();
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(
        () => new Statemachine({}, process, { maxQueueLength: bad }),
      ).toThrowError(RangeError);
    }
  });

  it("defaults to unbounded", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("go");
    expect(sm.getCurrentState().getName()).toBe("b");
  });
});
