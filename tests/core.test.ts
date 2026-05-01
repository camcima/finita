import { describe, it, expect, vi } from "vitest";
import {
  Event,
  Statemachine,
  ProcessBuilder,
  CallbackObserver,
  CallbackCondition,
  Tautology,
  Contradiction,
  WrongEventForStateError,
} from "../src/index.js";
import type {
  AfterTransitionObserver,
  TransitionFrame,
  EnqueueContext,
} from "../src/index.js";

describe("Event", () => {
  it("should have a name", () => {
    const event = new Event("test");
    expect(event.getName()).toBe("test");
  });

  it("should notify observers on invoke", async () => {
    const event = new Event("test");
    const fn = vi.fn();
    event.attach(new CallbackObserver(fn));
    await event.invoke("arg1", "arg2");
    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("should clear invoke args after invoke", async () => {
    const event = new Event("test");
    await event.invoke("arg1");
    expect(event.getInvokeArgs()).toEqual([]);
  });

  it("should support metadata", () => {
    const event = new Event("test");
    event.setMetadataValue("key", "value");
    expect(event.hasMetadataValue("key")).toBe(true);
    expect(event.getMetadataValue("key")).toBe("value");
    expect(event.getMetadata()).toEqual({ key: "value" });
    event.deleteMetadataValue("key");
    expect(event.hasMetadataValue("key")).toBe(false);
  });

  it("should detach observers", async () => {
    const event = new Event("test");
    const fn = vi.fn();
    const observer = new CallbackObserver(fn);
    event.attach(observer);
    event.detach(observer);
    await event.invoke();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("State (via ProcessBuilder)", () => {
  it("should have a name", () => {
    const process = new ProcessBuilder("p")
      .addState("closed", { initial: true })
      .build();
    expect(process.getState("closed").getName()).toBe("closed");
  });

  it("should manage transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const s1 = process.getState("s1");
    const transitions = Array.from(s1.getTransitions());
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.getTargetState().getName()).toBe("s2");
  });

  it("should auto-create events when adding transitions with event names", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "open" })
      .build();
    const s1 = process.getState("s1");
    expect(s1.hasEvent("open")).toBe(true);
    expect(s1.getEventNames()).toContain("open");
  });

  it("should not create event for automatic transitions", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2")
      .build();
    const s1 = process.getState("s1");
    expect(s1.getEventNames()).toEqual([]);
  });

  it("should getEvent by name", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "myEvent" })
      .build();
    const s1 = process.getState("s1");
    const event = s1.getEvent("myEvent");
    expect(event.getName()).toBe("myEvent");
    expect(s1.hasEvent("myEvent")).toBe(true);
    // Same reference on second call
    expect(s1.getEvent("myEvent")).toBe(event);
  });

  it("should support metadata", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true, metadata: { color: "red" } })
      .build();
    const s1 = process.getState("s1");
    expect(s1.getMetadataValue("color")).toBe("red");
    expect(s1.getMetadata()).toEqual({ color: "red" });
  });

  it("should deduplicate transitions by same (from, event, to, condition name)", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const s1 = process.getState("s1");
    expect(Array.from(s1.getTransitions())).toHaveLength(1);
  });

  it("should keep transitions with different targets", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addState("s3")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s1", "s3", { event: "go" })
      .build();
    const s1 = process.getState("s1");
    expect(Array.from(s1.getTransitions())).toHaveLength(2);
  });

  it("should keep transitions with different events", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s1", "s2", { event: "run" })
      .build();
    const s1 = process.getState("s1");
    expect(Array.from(s1.getTransitions())).toHaveLength(2);
  });

  it("should throw DuplicateTransitionError for same (from, event, to) with different condition names", () => {
    // In v3, conflicting condition names on the same (from, event, to) triple are rejected at build time.
    expect(() =>
      new ProcessBuilder("p")
        .addState("s1", { initial: true })
        .addState("s2")
        .addTransition("s1", "s2", {
          event: "go",
          condition: new CallbackCondition("a", () => true),
        })
        .addTransition("s1", "s2", {
          event: "go",
          condition: new CallbackCondition("b", () => true),
        })
        .build(),
    ).toThrow("Conflicting transition");
  });
});

describe("Transition (via ProcessBuilder)", () => {
  it("should store target state and event name", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { event: "go" })
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    expect(t.getTargetState().getName()).toBe("target");
    expect(t.getEventName()).toBe("go");
  });

  it("should default to null event name", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target")
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    expect(t.getEventName()).toBeNull();
  });

  it("should be active when event matches and no condition", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { event: "go" })
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    const event = new Event("go");
    expect(await t.isActive({}, new Map(), event)).toBe(true);
  });

  it("should be inactive when event does not match", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { event: "go" })
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    const event = new Event("stop");
    expect(await t.isActive({}, new Map(), event)).toBe(false);
  });

  it("should be active for automatic transition when no event provided", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target")
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    expect(await t.isActive({}, new Map())).toBe(true);
  });

  it("should be inactive for event transition when no event provided", async () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { event: "go" })
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    expect(await t.isActive({}, new Map())).toBe(false);
  });

  it("should preserve weight", () => {
    const process = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { weight: 5 })
      .build();
    const t = Array.from(process.getState("s1").getTransitions())[0]!;
    expect(t.getWeight()).toBe(5);
  });

  it("should report condition name", () => {
    const p1 = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { event: "go" })
      .build();
    const t1 = Array.from(p1.getState("s1").getTransitions())[0]!;
    expect(t1.getConditionName()).toBeNull();

    const cond = new CallbackCondition("myCondition", () => true);
    const p2 = new ProcessBuilder("p")
      .addState("s1", { initial: true })
      .addState("target")
      .addTransition("s1", "target", { event: "go", condition: cond })
      .build();
    const t2 = Array.from(p2.getState("s1").getTransitions())[0]!;
    expect(t2.getConditionName()).toBe("myCondition");
  });
});

describe("Process (via ProcessBuilder)", () => {
  it("should have name and initial state", () => {
    const process = new ProcessBuilder("myProcess")
      .addState("start", { initial: true })
      .build();
    expect(process.getName()).toBe("myProcess");
    expect(process.getInitialState().getName()).toBe("start");
  });

  it("should contain all declared states", () => {
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .addState("s2")
      .addState("s3")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s2", "s3", { event: "next" })
      .build();
    expect(process.hasState("s1")).toBe(true);
    expect(process.hasState("s2")).toBe(true);
    expect(process.hasState("s3")).toBe(true);
  });

  it("should return state by name", () => {
    const process = new ProcessBuilder("test")
      .addState("TestState", { initial: true })
      .build();
    const retrieved = process.getState("TestState");
    expect(retrieved.getName()).toBe("TestState");
  });

  it("should throw for non-existent state", () => {
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .build();
    expect(() => process.getState("missing")).toThrow();
  });
});

describe("Statemachine", () => {
  function createDoorMachine() {
    const process = new ProcessBuilder("door")
      .addState("closed", { initial: true })
      .addState("opened")
      .addTransition("closed", "opened", { event: "open" })
      .addTransition("closed", "closed", { event: "close" })
      .addTransition("opened", "opened", { event: "open" })
      .addTransition("opened", "closed", { event: "close" })
      .build();
    const subject = { name: "door1" };
    const sm = new Statemachine(subject, process);
    const closed = process.getState("closed");
    const opened = process.getState("opened");
    return { sm, closed, opened, subject, process };
  }

  it("should start at initial state", () => {
    const { sm } = createDoorMachine();
    expect(sm.getCurrentState().getName()).toBe("closed");
  });

  it("should transition on triggerEvent", async () => {
    const { sm } = createDoorMachine();
    await sm.triggerEvent("open");
    expect(sm.getCurrentState().getName()).toBe("opened");
  });

  it("should handle self-transitions", async () => {
    const { sm } = createDoorMachine();
    await sm.triggerEvent("open");
    await sm.triggerEvent("open");
    expect(sm.getCurrentState().getName()).toBe("opened");
  });

  it("should execute observers on event", async () => {
    const { sm, closed } = createDoorMachine();
    const fn = vi.fn();
    closed.getEvent("open").attach(new CallbackObserver(fn));
    await sm.triggerEvent("open");
    expect(fn).toHaveBeenCalled();
  });

  it("event observers fire on self-transition events (review fix)", async () => {
    const { sm, opened } = createDoorMachine();
    await sm.triggerEvent("open"); // closed -> opened
    const fn = vi.fn();
    opened.getEvent("open").attach(new CallbackObserver(fn));
    await sm.triggerEvent("open"); // opened -> opened (self)
    // Self-transitions don't change state, but event-attached observers
    // are imperative commands and must fire whenever the event is
    // resolved on the current state. State-machine after-observers
    // remain gated on state change (no-op on self-transition).
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sm.getCurrentState().getName()).toBe("opened");
  });

  it("event observers fire even when the matching transition has a false condition (review fix)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", {
        event: "go",
        condition: new Contradiction(),
      })
      .build();
    const fn = vi.fn();
    process.getState("a").getEvent("go").attach(new CallbackObserver(fn));
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("go");
    // Transition didn't fire (Contradiction condition is always false),
    // but the event observer still ran — the imperative command on the
    // event must fire whenever the event is resolved.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sm.getCurrentState().getName()).toBe("a");
  });

  it("should throw for wrong event", async () => {
    const { sm } = createDoorMachine();
    await expect(sm.triggerEvent("nonexistent")).rejects.toThrow(
      WrongEventForStateError,
    );
  });

  it("should notify statemachine observers on state change", async () => {
    const { sm } = createDoorMachine();
    const fn = vi.fn();
    const observer: AfterTransitionObserver = {
      notify(frame: TransitionFrame, _ctx: EnqueueContext) {
        fn(frame);
      },
    };
    sm.attachAfter(observer);
    await sm.triggerEvent("open");
    expect(fn).toHaveBeenCalled();
    const frame = fn.mock.calls[0][0] as TransitionFrame;
    expect(frame.toState.getName()).toBe("opened");
  });

  it("should return process and subject", () => {
    const { sm, subject } = createDoorMachine();
    expect(sm.getSubject()).toBe(subject);
    expect(sm.getProcess().getName()).toBe("door");
  });

  it("should start at specified state name", () => {
    const process = new ProcessBuilder("door")
      .addState("closed", { initial: true })
      .addState("opened")
      .addTransition("closed", "opened", { event: "open" })
      .addTransition("opened", "closed", { event: "close" })
      .build();
    const sm = new Statemachine({}, process, { initialStateName: "opened" });
    expect(sm.getCurrentState().getName()).toBe("opened");
  });

  it("should support autorelease lock", () => {
    const { sm } = createDoorMachine();
    expect(sm.isAutoreleaseLock()).toBe(true);
    sm.setAutoreleaseLock(false);
    expect(sm.isAutoreleaseLock()).toBe(false);
  });

  it("should handle checkTransitions for automatic transitions", async () => {
    const process = new ProcessBuilder("auto")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { condition: new Tautology() })
      .build();
    const sm = new Statemachine({}, process);
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("s2");
  });

  it("should pass context to triggerEvent", async () => {
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const receivedCtx: unknown[] = [];
    const s1 = process.getState("s1");
    s1.getEvent("go").attach(
      new CallbackObserver((...args: unknown[]) => {
        receivedCtx.push(...args);
      }),
    );
    const sm = new Statemachine({}, process);
    const ctx = new Map<string, unknown>([["key", "value"]]);
    await sm.triggerEvent("go", ctx);
    expect(receivedCtx).toContain(ctx);
  });
});

// === PHP-ported tests ===

describe("Event (PHP-ported)", () => {
  it("should have a non-empty name", () => {
    const event = new Event("TestEvent");
    const name = event.getName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("should use metadata for flags (ArrayAccess equivalent)", () => {
    const event = new Event("TestEvent");
    expect(event.hasMetadataValue("TestOffset")).toBe(false);
    event.setMetadataValue("TestOffset", "TestValue");
    expect(event.hasMetadataValue("TestOffset")).toBe(true);
    expect(event.getMetadataValue("TestOffset")).toBe("TestValue");
    event.deleteMetadataValue("TestOffset");
    expect(event.hasMetadataValue("TestOffset")).toBe(false);
  });
});

describe("State (PHP-ported)", () => {
  it("should have a non-empty name", () => {
    const process = new ProcessBuilder("p")
      .addState("TestState", { initial: true })
      .build();
    const state = process.getState("TestState");
    const name = state.getName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("should support metadata", () => {
    const process = new ProcessBuilder("p")
      .addState("TestState", {
        initial: true,
        metadata: { TestOffset: "TestValue" },
      })
      .build();
    const state = process.getState("TestState");
    expect(state.hasMetadataValue("TestOffset")).toBe(true);
    expect(state.getMetadataValue("TestOffset")).toBe("TestValue");
  });
});

describe("Process (PHP-ported)", () => {
  it("should contain states iterable", () => {
    const process = new ProcessBuilder("TestProcess")
      .addState("TestState", { initial: true })
      .build();
    const states = Array.from(process.getStates());
    expect(states.length).toBeGreaterThan(0);
  });

  it("should reply if it contains a state by name", () => {
    const process = new ProcessBuilder("TestProcess")
      .addState("TestState", { initial: true })
      .build();
    expect(process.hasState("TestState")).toBe(true);
  });

  it("should return a state by name", () => {
    const process = new ProcessBuilder("TestProcess")
      .addState("TestState", { initial: true })
      .build();
    const retrieved = process.getState("TestState");
    expect(retrieved.getName()).toBe("TestState");
  });
});

describe("Statemachine (PHP-ported)", () => {
  it("should provide current state", () => {
    const process = new ProcessBuilder("testProcess")
      .addState("new", { initial: true })
      .build();
    const sm = new Statemachine({}, process);
    expect(sm.getCurrentState().getName()).toBe("new");
  });

  it("should provide stateful subject", () => {
    const subject = { name: "test" };
    const process = new ProcessBuilder("testProcess")
      .addState("new", { initial: true })
      .build();
    const sm = new Statemachine(subject, process);
    expect(sm.getSubject()).toBe(subject);
  });

  it("should handle events that are triggered", async () => {
    const process = new ProcessBuilder("testProcess")
      .addState("new", { initial: true })
      .addState("second")
      .addTransition("new", "second", { event: "test event" })
      .build();
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("test event");
    expect(sm.getCurrentState().getName()).toBe("second");
  });

  it("should check if conditions are true (automatic transition)", async () => {
    let canBeClosed = false;
    const condition = new CallbackCondition("canBeClosed", () => canBeClosed);
    const process = new ProcessBuilder("testProcess")
      .addState("new", { initial: true })
      .addState("second")
      .addState("end")
      .addTransition("new", "second", { event: "test event" })
      .addTransition("second", "end", { condition })
      .build();
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("test event");
    expect(sm.getCurrentState().getName()).toBe("second");
    canBeClosed = true;
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("end");
  });

  it("should throw exception if current state does not have triggered event", async () => {
    const process = new ProcessBuilder("testProcess")
      .addState("new", { initial: true })
      .build();
    const sm = new Statemachine({}, process);
    await expect(sm.triggerEvent("foo")).rejects.toThrow(
      WrongEventForStateError,
    );
  });

  it("should allow lock to be managed from outside", async () => {
    const process = new ProcessBuilder("testProcess")
      .addState("new", { initial: true })
      .build();
    const sm = new Statemachine({}, process);
    const isAcquired = await sm.acquireLock();
    expect(isAcquired).toBe(true);
    expect(sm.isLockAcquired()).toBe(true);
    await sm.releaseLock();
    expect(sm.isLockAcquired()).toBe(false);
  });
});
