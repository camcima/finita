import { describe, it, expect, vi } from "vitest";
import {
  State,
  Transition,
  Process,
  Event,
  Statemachine,
  Dispatcher,
  CallbackObserver,
  Tautology,
  OnEnterObserver,
  LockAdapterMutex,
} from "../src/index.js";
import type {
  Observer,
  ObservableSubject,
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
  const s1 = new State("s1");
  const s2 = new State("s2");
  s1.addTransition(new Transition(s2, "go"));
  const process = new Process("test", s1);
  return new Statemachine({}, process, null, null, mutex ?? null);
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

      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, "go"));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process, null, null, mutex);

      let shouldThrow = true;
      s1.getEvent("go").attach(
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

      const throwingObserver: Observer = {
        update(_subject: ObservableSubject) {
          throw new Error("SM observer error");
        },
      };
      sm.attach(throwingObserver);

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should clear transient fields when SM observer throws", async () => {
      const sm = createTwoStateMachine();

      const throwingObserver: Observer = {
        update(_subject: ObservableSubject) {
          throw new Error("SM observer error");
        },
      };
      sm.attach(throwingObserver);

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.getCurrentContext()).toBeNull();
      expect(sm.getSelectedTransition()).toBeNull();
      expect(sm.getLastState()).toBeNull();
    });

    it("should advance currentState to target even when SM observer throws", async () => {
      const sm = createTwoStateMachine();

      const throwingObserver: Observer = {
        update(_subject: ObservableSubject) {
          throw new Error("SM observer error");
        },
      };
      sm.attach(throwingObserver);

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.getCurrentState().getName()).toBe("s2");
    });
  });

  describe("checkTransitions with throwing SM observer", () => {
    it("should release lock when observer throws during automatic transition", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");

      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process, null, null, mutex);

      const throwingObserver: Observer = {
        update(_subject: ObservableSubject) {
          throw new Error("SM observer error");
        },
      };
      sm.attach(throwingObserver);

      await expect(sm.checkTransitions()).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });
  });

  describe("Automatic transition cycle detection", () => {
    it("should throw on automatic self-transition via checkTransitions", async () => {
      const s1 = new State("s1");
      s1.addTransition(new Transition(s1, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process);

      await expect(sm.checkTransitions()).rejects.toThrow(
        /transition from current state "s1"/,
      );
      try {
        await sm.checkTransitions();
      } catch (e: unknown) {
        expect((e as Error).cause).toBeInstanceOf(Error);
        expect(((e as Error).cause as Error).message).toMatch(
          /Automatic transition cycle detected.*"s1"/,
        );
      }
    });

    it("should throw on automatic self-transition via triggerEvent", async () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, "go"));
      // s2 has an automatic self-transition — will be checked after state change
      s2.addTransition(new Transition(s2, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process);

      await expect(sm.triggerEvent("go")).rejects.toThrow(
        /transition from current state "s2"/,
      );
    });

    it("should throw on multi-state automatic cycle (s1 -> s2 -> s1)", async () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, null, new Tautology()));
      s2.addTransition(new Transition(s1, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process);

      try {
        await sm.checkTransitions();
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        expect(rootCause(e as Error).message).toMatch(
          /Automatic transition cycle detected.*"s1"/,
        );
      }
    });

    it("should throw on 3-state automatic cycle (s1 -> s2 -> s3 -> s1)", async () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      const s3 = new State("s3");
      s1.addTransition(new Transition(s2, null, new Tautology()));
      s2.addTransition(new Transition(s3, null, new Tautology()));
      s3.addTransition(new Transition(s1, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process);

      try {
        await sm.checkTransitions();
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        expect(rootCause(e as Error).message).toMatch(
          /Automatic transition cycle detected.*"s1"/,
        );
      }
      // s1 transitioned to s2, then s3, then tried to go back to s1
      expect(sm.getCurrentState().getName()).toBe("s3");
    });

    it("should detect cycle after event-triggered transition", async () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      const s3 = new State("s3");
      s1.addTransition(new Transition(s2, "go"));
      // After arriving at s2, automatic cycle: s2 -> s3 -> s2
      s2.addTransition(new Transition(s3, null, new Tautology()));
      s3.addTransition(new Transition(s2, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process);

      try {
        await sm.triggerEvent("go");
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        expect(rootCause(e as Error).message).toMatch(
          /Automatic transition cycle detected.*"s2"/,
        );
      }
    });

    it("should release lock when automatic cycle is detected", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");

      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, null, new Tautology()));
      s2.addTransition(new Transition(s1, null, new Tautology()));
      const process = new Process("test", s1);
      const sm = new Statemachine({}, process, null, null, mutex);

      await expect(sm.checkTransitions()).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should allow event-based self-transitions (not automatic)", async () => {
      const s1 = new State("s1");
      s1.addTransition(new Transition(s1, "retry"));
      const process = new Process("test", s1);
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
      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, "go"));
      const process = new Process("test", s1);
      const mutex = createStrictMutex();
      const sm = new Statemachine({}, process, null, null, mutex);

      // With a strict mutex, double release would throw
      await sm.triggerEvent("go");
      expect(sm.getCurrentState().getName()).toBe("s2");
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should release exactly once when event observer throws", async () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, "go"));
      const process = new Process("test", s1);
      const mutex = createStrictMutex();
      const sm = new Statemachine({}, process, null, null, mutex);

      s1.getEvent("go").attach(
        new CallbackObserver(() => {
          throw new Error("event observer error");
        }),
      );

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isLockAcquired()).toBe(false);
    });
  });

  describe("dispatchEvent cleanup", () => {
    it("should release lock and clear fields when dispatcher.dispatch() throws", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");
      const sm = createTwoStateMachine(mutex);

      // Pre-invoke the dispatcher so dispatch() throws "Was already invoked!"
      const dispatcher = new Dispatcher();
      dispatcher.dispatch(sm.getCurrentState().getEvent("go"), []);
      await dispatcher.invoke();

      await expect(sm.dispatchEvent(dispatcher, "go")).rejects.toThrow(
        "Was already invoked!",
      );
      expect(sm.isLockAcquired()).toBe(false);
    });

    it("should allow subsequent triggerEvent after dispatchEvent failure", async () => {
      const adapter = createLockAdapter();
      const mutex = new LockAdapterMutex(adapter, "res");
      const sm = createTwoStateMachine(mutex);

      // Pre-invoke the dispatcher so dispatch() throws
      const dispatcher = new Dispatcher();
      dispatcher.dispatch(sm.getCurrentState().getEvent("go"), []);
      await dispatcher.invoke();

      await expect(sm.dispatchEvent(dispatcher, "go")).rejects.toThrow();

      // SM should be usable again
      await sm.triggerEvent("go");
      expect(sm.getCurrentState().getName()).toBe("s2");
    });
  });

  describe("OnEnterObserver with throwing nested triggerEvent", () => {
    it("should restore autoreleaseLock when onEnter event observer throws", async () => {
      const s1 = new State("s1");
      const s2 = new State("s2");
      s1.addTransition(new Transition(s2, "go"));
      // Self-transition for onEnter processing
      s2.addTransition(new Transition(s2, "onEnter"));
      s2.getEvent("onEnter").attach(
        new CallbackObserver(() => {
          throw new Error("onEnter observer error");
        }),
      );

      const process = new Process("test", s1);
      const sm = new Statemachine({}, process);
      sm.attach(new OnEnterObserver());

      await expect(sm.triggerEvent("go")).rejects.toThrow();
      expect(sm.isAutoreleaseLock()).toBe(true);
    });
  });
});
