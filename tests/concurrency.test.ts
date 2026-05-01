import { describe, it, expect, vi } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  Tautology,
  LockCanNotBeAcquiredError,
} from "../src/index.js";
import type { TransitionFrame, MutexInterface } from "../src/index.js";

describe("Concurrency — same-instance serialization (closes #1)", () => {
  it("queues a second triggerEvent while the first is mid-flight", async () => {
    const order: string[] = [];

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "first" })
      .addTransition("b", "c", { event: "second" })
      .build();
    const sm = new Statemachine({}, process);

    let releaseFirst!: () => void;
    const firstPause = new Promise<void>((r) => {
      releaseFirst = r;
    });

    sm.attachAfter({
      async notify(frame: TransitionFrame): Promise<void> {
        if (frame.event?.getName() === "first") {
          order.push("first-after-start");
          await firstPause;
          order.push("first-after-end");
        } else if (frame.event?.getName() === "second") {
          order.push("second-after");
        }
      },
    });

    const p1 = sm.triggerEvent("first");
    const p2 = sm.triggerEvent("second");

    // Allow the first observer to start, then release it after a tick.
    await new Promise((r) => setTimeout(r, 10));
    releaseFirst();

    await Promise.all([p1, p2]);

    expect(order).toEqual([
      "first-after-start",
      "first-after-end",
      "second-after",
    ]);
    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("queues checkTransitions behind an in-flight triggerEvent", async () => {
    // Setup: triggerEvent moves a→b; checkTransitions then moves b→c via auto.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { condition: new Tautology() })
      .build();
    const sm = new Statemachine({}, process);

    let release!: () => void;
    const pause = new Promise<void>((r) => {
      release = r;
    });

    sm.attachAfter({
      async notify(frame: TransitionFrame): Promise<void> {
        if (frame.toState.getName() === "b") {
          await pause;
        }
      },
    });

    const p1 = sm.triggerEvent("go");
    const p2 = sm.checkTransitions();

    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all([p1, p2]);

    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("acquires the mutex exactly once per top-level operation", async () => {
    let acquired = false;
    const mutex: MutexInterface = {
      acquireLock: vi.fn(async () => {
        acquired = true;
        return true;
      }),
      releaseLock: vi.fn(async () => {
        acquired = false;
        return true;
      }),
      isAcquired: vi.fn(() => acquired),
      isLocked: vi.fn(async () => false),
    };

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "a", { event: "back" })
      .build();
    const sm = new Statemachine({}, process, { mutex });

    await sm.triggerEvent("go");
    await sm.triggerEvent("back");
    expect(mutex.acquireLock).toHaveBeenCalledTimes(2);
    expect(mutex.releaseLock).toHaveBeenCalledTimes(2);
  });

  it("LockCanNotBeAcquiredError when mutex.acquireLock returns false", async () => {
    const mutex: MutexInterface = {
      acquireLock: async () => false,
      releaseLock: async () => true,
      isAcquired: () => false,
      isLocked: async () => false,
    };
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process, { mutex });
    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
      LockCanNotBeAcquiredError,
    );
  });
});
