import { describe, it, expect, vi } from "vitest";
import {
  Event,
  Statemachine,
  ProcessBuilder,
  CallbackObserver,
  Tautology,
  OnEnterObserver,
  LockAdapterMutex,
  AutomaticTransitionCycleError,
} from "../src/index.js";
import type {
  AfterTransitionObserver,
  TransitionFrame,
  EnqueueContext,
  LockAdapterInterface,
  MutexInterface,
} from "../src/index.js";

function rootCause(error: Error): Error {
  let current = error;
  while (current.cause instanceof Error) {
    current = current.cause;
  }
  return current;
}

function createLockAdapter(): LockAdapterInterface {
  const locks = new Map<string, boolean>();
  return {
    acquireLock: vi.fn((name: string) => {
      if (locks.get(name)) return false;
      locks.set(name, true);
      return true;
    }),
    releaseLock: vi.fn((name: string) => {
      locks.delete(name);
      return true;
    }),
    isLocked: vi.fn((name: string) => locks.has(name)),
  };
}

function createTwoStateMachine(mutex?: LockAdapterMutex) {
  const process = new ProcessBuilder("test")
    .addState("s1", { initial: true })
    .addState("s2")
    .addTransition("s1", "s2", { event: "go" })
    .build();
  return new Statemachine({}, process, { mutex: mutex ?? undefined });
}

describe("Exception cleanup", () => {
  describe("Event.invoke", () => {
    it("should clear invokeArgs when observer throws", async () => {
      const event = new Event("test");
      event.attach(
        new CallbackObserver(() => {
          throw new Error("observer error");
        }),
      );
      await expect(event.invoke("arg1", "arg2")).rejects.toThrow(
        "observer error",
      );
      expect(event.getInvokeArgs()).toEqual([]);
    });
  });

  describe("triggerEvent with throwing event observer", () => {
    it("should release lock when event observer throws", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");
      const sm = createTwoStateMachine(mutex);

      sm.getCurrentState()
        .getEvent("go")
        .attach(
          new CallbackObserver(() => {
            throw new Error("event observer error");
          }),
        );

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should leave state unchanged when event observer throws (pre-transition)", async () => {
      const sm = createTwoStateMachine();

      sm.getCurrentState()
        .getEvent("go")
        .attach(
          new CallbackObserver(() => {
            throw new Error("event observer error");
          }),
        );

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.getCurrentState().getName()).toBe("s1");
    });

    it("should allow subsequent triggerEvent after event observer throws", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");

      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        .build();
      const sm = new Statemachine({}, process, { mutex });

      let shouldThrow = true;
      process
        .getState("s1")
        .getEvent("go")
        .attach(
          new CallbackObserver(() => {
            if (shouldThrow) throw new Error("event observer error");
          }),
        );

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);

      // Second call should succeed
      shouldThrow = false;
      await sm.triggerEvent("go");
      expect(sm.getCurrentState().getName()).toBe("s2");
    });
  });

  describe("triggerEvent with throwing SM observer", () => {
    it("should release lock when SM observer throws during notify", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");
      const sm = createTwoStateMachine(mutex);

      const throwingObserver: AfterTransitionObserver = {
        notify(_frame: TransitionFrame, _ctx: EnqueueContext) {
          throw new Error("SM observer error");
        },
      };
      sm.attachAfter(throwingObserver);

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });

    // "should clear transient fields when SM observer throws" is dropped:
    // v3 has no transient fields (selectedTransition, currentContext) — the
    // frame is passed directly to observers and not stored on the SM.

    it("should advance currentState to target even when SM observer throws", async () => {
      const sm = createTwoStateMachine();

      const throwingObserver: AfterTransitionObserver = {
        notify(_frame: TransitionFrame, _ctx: EnqueueContext) {
          throw new Error("SM observer error");
        },
      };
      sm.attachAfter(throwingObserver);

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      // In v3, after-observers run POST commit, so state is already s2
      expect(sm.getCurrentState().getName()).toBe("s2");
    });
  });

  describe("checkTransitions with throwing SM observer", () => {
    it("should release lock when observer throws during automatic transition", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");

      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { condition: new Tautology() })
        .build();
      const sm = new Statemachine({}, process, { mutex });

      const throwingObserver: AfterTransitionObserver = {
        notify(_frame: TransitionFrame, _ctx: EnqueueContext) {
          throw new Error("SM observer error");
        },
      };
      sm.attachAfter(throwingObserver);

      await expect(sm.checkTransitions()).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });
  });

  describe("Automatic transition cycle detection", () => {
    it("should throw on automatic self-transition via checkTransitions", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addTransition("s1", "s1", { condition: new Tautology() })
        .build();
      const sm = new Statemachine({}, process, { maxAutomaticHops: 5 });

      const err = await sm.checkTransitions().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AutomaticTransitionCycleError);
      const e = err as AutomaticTransitionCycleError;
      expect(e.stateName).toBe("s1");
      expect(e.hopLimit).toBe(5);
    });

    it("should throw on automatic self-transition via triggerEvent", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        // s2 has an automatic self-transition — will be checked after state change
        .addTransition("s1", "s2", { event: "go" })
        .addTransition("s2", "s2", { condition: new Tautology() })
        .build();
      const sm = new Statemachine({}, process, { maxAutomaticHops: 5 });

      const err = await sm.triggerEvent("go").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AutomaticTransitionCycleError);
      const e = err as AutomaticTransitionCycleError;
      expect(e.stateName).toBe("s2");
      expect(e.hopLimit).toBe(5);
    });

    it("should throw on multi-state automatic cycle (s1 -> s2 -> s1)", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { condition: new Tautology() })
        .addTransition("s2", "s1", { condition: new Tautology() })
        .build();
      // maxAutomaticHops=6: hops 1-6 commit (ending at s1), hop 7 targets s2 and throws.
      const sm = new Statemachine({}, process, { maxAutomaticHops: 6 });

      try {
        await sm.checkTransitions();
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        const err = rootCause(e as Error);
        expect(err).toBeInstanceOf(AutomaticTransitionCycleError);
        const cycle = err as AutomaticTransitionCycleError;
        expect(cycle.stateName).toBe("s2");
        expect(cycle.hopLimit).toBe(6);
      }
    });

    it("should throw on 3-state automatic cycle (s1 -> s2 -> s3 -> s1)", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addState("s3")
        .addTransition("s1", "s2", { condition: new Tautology() })
        .addTransition("s2", "s3", { condition: new Tautology() })
        .addTransition("s3", "s1", { condition: new Tautology() })
        .build();
      // maxAutomaticHops=6: hops 1-6 commit ending at s1 (full 2 cycles), hop 7 targets s2 and throws.
      const sm = new Statemachine({}, process, { maxAutomaticHops: 6 });

      try {
        await sm.checkTransitions();
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        const err = rootCause(e as Error);
        expect(err).toBeInstanceOf(AutomaticTransitionCycleError);
        const cycle = err as AutomaticTransitionCycleError;
        expect(cycle.stateName).toBe("s2");
        expect(cycle.hopLimit).toBe(6);
      }
      // 6 hops committed: s2, s3, s1, s2, s3, s1 — last committed state is s1
      expect(sm.getCurrentState().getName()).toBe("s1");
    });

    it("should detect cycle after event-triggered transition", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addState("s3")
        // After arriving at s2, automatic cycle: s2 -> s3 -> s2
        .addTransition("s1", "s2", { event: "go" })
        .addTransition("s2", "s3", { condition: new Tautology() })
        .addTransition("s3", "s2", { condition: new Tautology() })
        .build();
      // maxAutomaticHops=5: hops 1-5 commit (ending at s3), hop 6 targets s2 and throws.
      const sm = new Statemachine({}, process, { maxAutomaticHops: 5 });

      try {
        await sm.triggerEvent("go");
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        const err = rootCause(e as Error);
        expect(err).toBeInstanceOf(AutomaticTransitionCycleError);
        const cycle = err as AutomaticTransitionCycleError;
        expect(cycle.stateName).toBe("s2");
        expect(cycle.hopLimit).toBe(5);
      }
    });

    it("should release lock when automatic cycle is detected", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");

      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { condition: new Tautology() })
        .addTransition("s2", "s1", { condition: new Tautology() })
        .build();
      const sm = new Statemachine({}, process, { mutex });

      await expect(sm.checkTransitions()).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should allow event-based self-transitions (not automatic)", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addTransition("s1", "s1", { event: "retry" })
        .build();
      const sm = new Statemachine({}, process);

      // Event-based self-transitions are fine — they don't recurse automatically
      await sm.triggerEvent("retry");
      expect(sm.getCurrentState().getName()).toBe("s1");
    });
  });

  describe("Strict mutex (no idempotent release)", () => {
    function createStrictMutex(): MutexInterface {
      let acquired = false;
      return {
        acquireLock() {
          if (acquired) return false;
          acquired = true;
          return true;
        },
        releaseLock() {
          if (!acquired) {
            throw new Error("Cannot release a lock that is not acquired");
          }
          acquired = false;
          return true;
        },
        isAcquired() {
          return acquired;
        },
        isLocked() {
          return acquired;
        },
      };
    }

    it("should not double-release lock on successful triggerEvent", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        .build();
      const mutex = createStrictMutex();
      const sm = new Statemachine({}, process, { mutex });

      // With a strict mutex, double release would throw
      await sm.triggerEvent("go");
      expect(sm.getCurrentState().getName()).toBe("s2");
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should release exactly once when event observer throws", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        .build();
      const mutex = createStrictMutex();
      const sm = new Statemachine({}, process, { mutex });

      process
        .getState("s1")
        .getEvent("go")
        .attach(
          new CallbackObserver(() => {
            throw new Error("event observer error");
          }),
        );

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });
  });

  describe("OnEnterObserver with throwing nested triggerEvent", () => {
    it("should restore autoreleaseLock when onEnter event observer throws", async () => {
      const process = new ProcessBuilder("test")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", { event: "go" })
        // Self-transition for onEnter processing
        .addTransition("s2", "s2", { event: "onEnter" })
        .build();

      process
        .getState("s2")
        .getEvent("onEnter")
        .attach(
          new CallbackObserver(() => {
            throw new Error("onEnter observer error");
          }),
        );

      const sm = new Statemachine({}, process);
      sm.attachAfter(new OnEnterObserver());

      // In v3, OnEnterObserver enqueues "onEnter" as a separate operation.
      // The chained op error does not propagate to the original caller,
      // so triggerEvent("go") resolves successfully.
      await sm.triggerEvent("go");
      expect(sm.isAutoreleaseLock()).toBe(true);
    });
  });
});
