import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Factory,
  SingleProcessDetector,
  Tautology,
  QueueLimitExceededError,
  LockCanNotBeReleasedError,
} from "../src/index.js";
import type { MutexInterface, ProcessInterface } from "../src/index.js";

const simpleProcess = (): ProcessInterface =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();

describe("Factory forwards StatemachineOptions to the machines it creates", () => {
  it("applies autoreleaseLock", async () => {
    const factory = new Factory(
      new SingleProcessDetector(simpleProcess()),
      null,
      {
        autoreleaseLock: false,
      },
    );
    const sm = await factory.createStatemachine({});
    expect(sm.isAutoreleaseLock()).toBe(false);
  });

  it("applies maxQueueLength as back-pressure", async () => {
    const factory = new Factory(
      new SingleProcessDetector(simpleProcess()),
      null,
      {
        maxQueueLength: 1,
      },
    );
    const sm = await factory.createStatemachine({});
    // First op is already running, second waits in the queue, third exceeds
    // the limit and is rejected rather than queued.
    const first = sm.triggerEvent("go");
    const second = sm.triggerEvent("go");
    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
      QueueLimitExceededError,
    );
    await Promise.allSettled([first, second]);
  });

  it("applies maxAutomaticHops", async () => {
    const looping = new ProcessBuilder("loop")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { condition: new Tautology() })
      .addTransition("b", "a", { condition: new Tautology() })
      .build();
    const factory = new Factory(new SingleProcessDetector(looping), null, {
      maxAutomaticHops: 3,
    });
    const sm = await factory.createStatemachine({});
    // Assert the configured limit, not just the error type — the default of
    // 100 would raise the same error and hide a dropped option.
    await expect(sm.checkTransitions()).rejects.toMatchObject({
      name: "AutomaticTransitionCycleError",
      hopLimit: 3,
    });
  });

  it("applies onReleaseError", async () => {
    class FalseReleaseMutex implements MutexInterface {
      private acquired = false;
      async acquireLock(): Promise<boolean> {
        this.acquired = true;
        return true;
      }
      async releaseLock(): Promise<boolean> {
        return false;
      }
      isAcquired(): boolean {
        return this.acquired;
      }
      async isLocked(): Promise<boolean> {
        return this.acquired;
      }
    }
    const releaseErrors: unknown[] = [];
    const factory = new Factory(
      new SingleProcessDetector(simpleProcess()),
      null,
      {
        onReleaseError: (err) => releaseErrors.push(err),
      },
    );
    factory.setMutexFactory({ createMutex: () => new FalseReleaseMutex() });
    const sm = await factory.createStatemachine({});

    await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
      LockCanNotBeReleasedError,
    );
    expect(releaseErrors).toHaveLength(1);
  });

  it("applies onChainedOperationError", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const chainedErrors: unknown[] = [];
    const factory = new Factory(new SingleProcessDetector(process), null, {
      onChainedOperationError: (err) => chainedErrors.push(err),
    });
    // The chained event does not exist on the target state, so the chained
    // operation fails — its error is only observable through the sink.
    factory.attachAfterObserver({
      notify: (_frame, ctx) => {
        ctx.enqueue("missing");
      },
    });
    const sm = await factory.createStatemachine({});
    await sm.triggerEvent("go");
    await sm.whenIdle();
    expect(chainedErrors).toHaveLength(1);
  });

  it("excludes factory-owned settings from the template at compile time", async () => {
    // initialStateName, mutex and transitionSelector are derived by the
    // factory itself (from the state-name detector, the mutex factory and
    // setTransitionSelector), so the template must not be able to contradict
    // them. tsconfig.test.json type-checks this file, so these are enforced.
    const factory = new Factory(
      new SingleProcessDetector(simpleProcess()),
      null,
      {
        // @ts-expect-error initialStateName comes from the state-name detector
        initialStateName: "b",
      },
    );
    const sm = await factory.createStatemachine({});
    expect(sm.getCurrentState().getName()).toBe("a");
  });
});
