import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  QueueLimitExceededError,
} from "../src/index.js";
import type {
  ConditionInterface,
  EnqueueContext,
  TransitionFrame,
} from "../src/index.js";

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

  it("rejects checkTransitions beyond the limit and names it in the error", async () => {
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
    const rejection = await sm.checkTransitions().catch((err: unknown) => err);
    expect(rejection).toBeInstanceOf(QueueLimitExceededError);
    expect((rejection as Error).message).toContain("checkTransitions()");

    gate.resolve();
    await first;
    await second.catch(() => undefined);
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

  it("throws QueueLimitExceededError into the enqueuing after-observer's error path when a chained enqueue() overflows the queue", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "next" })
      .build();
    const sm = new Statemachine({}, process, { maxQueueLength: 1 });

    // Captured synchronously from inside the after-observer, before either
    // enqueue() call — proves the transition commits before after-observers
    // run, without racing the drain loop that follows.
    let stateWhileAfterObserverRan: string | undefined;

    sm.attachAfter({
      notify(frame: TransitionFrame, ctx: EnqueueContext): void {
        if (frame.toState.getName() !== "b") return;
        stateWhileAfterObserverRan = sm.getCurrentState().getName();
        // The queue is empty here (the running operation doesn't count),
        // so this first chained enqueue succeeds: queue size 0 -> 1.
        ctx.enqueue("next");
        // The queue is now at maxQueueLength (1); this call throws
        // QueueLimitExceededError synchronously into this observer.
        ctx.enqueue("next");
      },
    });

    // The throw from the second enqueue() is collected as an after-observer
    // error and rejects the original caller's promise, per the
    // maxQueueLength JSDoc.
    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
      QueueLimitExceededError,
    );
    // The transition had already committed before the after-observer ran.
    expect(stateWhileAfterObserverRan).toBe("b");

    // By the time the rejection reaches the caller, the drain loop has
    // already dequeued and run the successfully-enqueued chained "next" op
    // (that continuation is scheduled ahead of the caller's own rejection
    // handler), so the machine has moved on past "b" already. This is the
    // exact scenario the JSDoc warns about: the rejection alone does not
    // tell the caller where the machine ended up.
    expect(sm.getCurrentState().getName()).toBe("c");

    await sm.whenIdle();
    expect(sm.getCurrentState().getName()).toBe("c");
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
