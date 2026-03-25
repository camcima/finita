import { describe, it, expect } from "vitest";
import {
  State,
  Transition,
  Process,
  Statemachine,
  CallbackCondition,
  CallbackObserver,
  LockAdapterMutex,
} from "../src/index.js";
import type { LockAdapterInterface } from "../src/index.js";

describe("Integration: async condition + observer + mutex", () => {
  it("should handle async conditions that simulate a DB check", async () => {
    const s1 = new State("pending");
    const s2 = new State("approved");
    const s3 = new State("rejected");

    const dbCheck = new CallbackCondition("dbApprovalCheck", async () => {
      // Simulate async DB query
      await new Promise((resolve) => setTimeout(resolve, 5));
      return true;
    });

    s1.addTransition(new Transition(s2, null, dbCheck));
    s1.addTransition(new Transition(s3, "reject"));

    const process = new Process("approval", s1);
    const sm = new Statemachine({}, process);

    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("approved");
  });

  it("should handle async observers that simulate an API call", async () => {
    const s1 = new State("new");
    const s2 = new State("notified");
    s1.addTransition(new Transition(s2, "notify"));

    const apiCalls: string[] = [];
    const asyncObserver = new CallbackObserver(async () => {
      // Simulate async API call
      await new Promise((resolve) => setTimeout(resolve, 5));
      apiCalls.push("notification_sent");
    });
    s1.getEvent("notify").attach(asyncObserver);

    const process = new Process("notification", s1);
    const sm = new Statemachine({}, process);

    await sm.triggerEvent("notify");
    expect(sm.getCurrentState().getName()).toBe("notified");
    expect(apiCalls).toEqual(["notification_sent"]);
  });

  it("should handle async mutex via LockAdapterMutex", async () => {
    const locks = new Map<string, boolean>();
    const asyncAdapter: LockAdapterInterface = {
      acquireLock: async (name: string) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (locks.has(name)) return false;
        locks.set(name, true);
        return true;
      },
      releaseLock: async (name: string) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        locks.delete(name);
        return true;
      },
      isLocked: async (name: string) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return locks.has(name);
      },
    };

    const s1 = new State("idle");
    const s2 = new State("active");
    s1.addTransition(new Transition(s2, "start"));
    s2.addTransition(new Transition(s1, "stop"));

    const process = new Process("worker", s1);
    const mutex = new LockAdapterMutex(asyncAdapter, "worker-lock");
    const sm = new Statemachine({}, process, null, null, mutex);

    await sm.triggerEvent("start");
    expect(sm.getCurrentState().getName()).toBe("active");

    await sm.triggerEvent("stop");
    expect(sm.getCurrentState().getName()).toBe("idle");
  });
});
