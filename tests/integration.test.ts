import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  CallbackCondition,
  CallbackObserver,
  LockAdapterMutex,
} from "../src/index.js";
import type { LockAdapterInterface } from "../src/index.js";

describe("Integration: async condition + observer + mutex", () => {
  it("should handle async conditions that simulate a DB check", async () => {
    const dbCheck = new CallbackCondition("dbApprovalCheck", async () => {
      // Simulate async DB query
      await new Promise((resolve) => setTimeout(resolve, 5));
      return true;
    });

    const process = new ProcessBuilder("approval")
      .addState("pending", { initial: true })
      .addState("approved")
      .addState("rejected")
      .addTransition("pending", "approved", { condition: dbCheck })
      .addTransition("pending", "rejected", { event: "reject" })
      .build();
    const sm = new Statemachine({}, process);

    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("approved");
  });

  it("should handle async observers that simulate an API call", async () => {
    const process = new ProcessBuilder("notification")
      .addState("new", { initial: true })
      .addState("notified")
      .addTransition("new", "notified", { event: "notify" })
      .build();

    const apiCalls: string[] = [];
    const asyncObserver = new CallbackObserver(async () => {
      // Simulate async API call
      await new Promise((resolve) => setTimeout(resolve, 5));
      apiCalls.push("notification_sent");
    });
    process.getState("new").getEvent("notify").attach(asyncObserver);

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

    const process = new ProcessBuilder("worker")
      .addState("idle", { initial: true })
      .addState("active")
      .addTransition("idle", "active", { event: "start" })
      .addTransition("active", "idle", { event: "stop" })
      .build();
    const mutex = new LockAdapterMutex(asyncAdapter, "worker-lock");
    const sm = new Statemachine({}, process, { mutex });

    await sm.triggerEvent("start");
    expect(sm.getCurrentState().getName()).toBe("active");

    await sm.triggerEvent("stop");
    expect(sm.getCurrentState().getName()).toBe("idle");
  });
});
