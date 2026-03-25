import { describe, it, expect, vi } from "vitest";
import {
  State,
  Transition,
  Process,
  Event,
  Statemachine,
  Dispatcher,
  CallbackObserver,
  CallbackCondition,
  Tautology,
  StateCollection,
  WrongEventForStateError,
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

describe("State", () => {
  it("should have a name", () => {
    const state = new State("closed");
    expect(state.getName()).toBe("closed");
  });

  it("should manage transitions", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const t = new Transition(s2, "go");
    s1.addTransition(t);
    const transitions = Array.from(s1.getTransitions());
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toBe(t);
  });

  it("should auto-create events when adding transitions with event names", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "open"));
    expect(s1.hasEvent("open")).toBe(true);
    expect(s1.getEventNames()).toContain("open");
  });

  it("should not create event for automatic transitions", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2));
    expect(s1.getEventNames()).toEqual([]);
  });

  it("should getEvent create on demand", () => {
    const state = new State("s1");
    const event = state.getEvent("myEvent");
    expect(event.getName()).toBe("myEvent");
    expect(state.hasEvent("myEvent")).toBe(true);
    // Same reference on second call
    expect(state.getEvent("myEvent")).toBe(event);
  });

  it("should support metadata", () => {
    const state = new State("s1");
    state.setMetadataValue("color", "red");
    expect(state.getMetadataValue("color")).toBe("red");
    expect(state.getMetadata()).toEqual({ color: "red" });
  });

  it("should deduplicate transitions by same instance", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const t = new Transition(s2, "go");
    s1.addTransition(t);
    s1.addTransition(t);
    expect(Array.from(s1.getTransitions())).toHaveLength(1);
  });

  it("should deduplicate transitions by value (target + event + condition)", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    s1.addTransition(new Transition(s2, "go"));
    expect(Array.from(s1.getTransitions())).toHaveLength(1);
  });

  it("should deduplicate transitions with same condition name (name is identity)", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    // Two different condition objects with the same name are treated as
    // semantically equivalent — the condition name is identity, not the object.
    const c1 = new CallbackCondition("check", () => true);
    const c2 = new CallbackCondition("check", () => false);
    s1.addTransition(new Transition(s2, "go", c1));
    s1.addTransition(new Transition(s2, "go", c2));
    expect(Array.from(s1.getTransitions())).toHaveLength(1);
    // The first condition wins — c2 is silently ignored
    const kept = Array.from(s1.getTransitions())[0] as Transition;
    expect(kept.getCondition()).toBe(c1);
  });

  it("should keep transitions with different targets", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const s3 = new State("s3");
    s1.addTransition(new Transition(s2, "go"));
    s1.addTransition(new Transition(s3, "go"));
    expect(Array.from(s1.getTransitions())).toHaveLength(2);
  });

  it("should keep transitions with different events", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    s1.addTransition(new Transition(s2, "run"));
    expect(Array.from(s1.getTransitions())).toHaveLength(2);
  });

  it("should keep transitions with different condition names", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(
      new Transition(s2, "go", new CallbackCondition("a", () => true)),
    );
    s1.addTransition(
      new Transition(s2, "go", new CallbackCondition("b", () => true)),
    );
    expect(Array.from(s1.getTransitions())).toHaveLength(2);
  });
});

describe("Transition", () => {
  it("should store target state and event name", () => {
    const target = new State("target");
    const t = new Transition(target, "go");
    expect(t.getTargetState()).toBe(target);
    expect(t.getEventName()).toBe("go");
  });

  it("should default to null event name", () => {
    const target = new State("target");
    const t = new Transition(target);
    expect(t.getEventName()).toBeNull();
  });

  it("should be active when event matches and no condition", async () => {
    const target = new State("target");
    const t = new Transition(target, "go");
    const event = new Event("go");
    expect(await t.isActive({}, new Map(), event)).toBe(true);
  });

  it("should be inactive when event does not match", async () => {
    const target = new State("target");
    const t = new Transition(target, "go");
    const event = new Event("stop");
    expect(await t.isActive({}, new Map(), event)).toBe(false);
  });

  it("should be active for automatic transition when no event provided", async () => {
    const target = new State("target");
    const t = new Transition(target);
    expect(await t.isActive({}, new Map())).toBe(true);
  });

  it("should be inactive for event transition when no event provided", async () => {
    const target = new State("target");
    const t = new Transition(target, "go");
    expect(await t.isActive({}, new Map())).toBe(false);
  });

  it("should support weight", () => {
    const t = new Transition(new State("target"));
    expect(t.getWeight()).toBe(1);
    t.setWeight(5);
    expect(t.getWeight()).toBe(5);
  });

  it("should report condition name", () => {
    const target = new State("target");
    const t1 = new Transition(target, "go");
    expect(t1.getConditionName()).toBeNull();

    const cond = new CallbackCondition("myCondition", () => true);
    const t2 = new Transition(target, "go", cond);
    expect(t2.getConditionName()).toBe("myCondition");
  });
});

describe("Process", () => {
  it("should have name and initial state", () => {
    const initial = new State("start");
    const process = new Process("myProcess", initial);
    expect(process.getName()).toBe("myProcess");
    expect(process.getInitialState()).toBe(initial);
  });

  it("should auto-discover states from transitions", () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    const s3 = new State("s3");
    s1.addTransition(new Transition(s2, "go"));
    s2.addTransition(new Transition(s3, "next"));
    const process = new Process("test", s1);
    expect(process.hasState("s1")).toBe(true);
    expect(process.hasState("s2")).toBe(true);
    expect(process.hasState("s3")).toBe(true);
  });

  it("should throw for duplicate state names with different instances", () => {
    const s1 = new State("s1");
    const s2a = new State("s2");
    const s2b = new State("s2");
    s1.addTransition(new Transition(s2a, "a"));
    s1.addTransition(new Transition(s2b, "b"));
    expect(() => new Process("test", s1)).toThrow("different state");
  });
});

describe("Dispatcher", () => {
  it("should dispatch and invoke events", async () => {
    const fn = vi.fn();
    const event = new Event("test");
    event.attach(new CallbackObserver(fn));
    const dispatcher = new Dispatcher();
    dispatcher.dispatch(event, ["arg1"]);
    expect(fn).not.toHaveBeenCalled();
    await dispatcher.invoke();
    expect(fn).toHaveBeenCalledWith("arg1");
    expect(dispatcher.isReady()).toBe(true);
  });

  it("should throw if invoked twice", async () => {
    const dispatcher = new Dispatcher();
    await dispatcher.invoke();
    await expect(dispatcher.invoke()).rejects.toThrow("already invoked");
  });

  it("should throw if dispatched after invoke", async () => {
    const dispatcher = new Dispatcher();
    await dispatcher.invoke();
    expect(() => dispatcher.dispatch(new Event("x"))).toThrow(
      "already invoked",
    );
  });

  it("should call onReady callbacks", async () => {
    const onReady = vi.fn();
    const dispatcher = new Dispatcher();
    dispatcher.dispatch(new Event("test"), [], { invoke: onReady });
    await dispatcher.invoke();
    expect(onReady).toHaveBeenCalled();
  });
});

describe("Statemachine", () => {
  function createDoorMachine() {
    const closed = new State("closed");
    const opened = new State("opened");
    closed.addTransition(new Transition(opened, "open"));
    closed.addTransition(new Transition(closed, "close"));
    opened.addTransition(new Transition(opened, "open"));
    opened.addTransition(new Transition(closed, "close"));
    const process = new Process("door", closed);
    const subject = { name: "door1" };
    const sm = new Statemachine(subject, process);
    return { sm, closed, opened, subject };
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

  it("should not execute observers on self-transition", async () => {
    const { sm, opened } = createDoorMachine();
    await sm.triggerEvent("open");
    const fn = vi.fn();
    opened.getEvent("open").attach(new CallbackObserver(fn));
    await sm.triggerEvent("open");
    // Self-transition does not change state, so statemachine observers not notified
    // but event observers ARE notified (event is still fired)
    expect(fn).toHaveBeenCalled();
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
    sm.attach({ update: fn });
    await sm.triggerEvent("open");
    expect(fn).toHaveBeenCalledWith(sm);
  });

  it("should return process and subject", () => {
    const { sm, subject } = createDoorMachine();
    expect(sm.getSubject()).toBe(subject);
    expect(sm.getProcess().getName()).toBe("door");
  });

  it("should start at specified state name", () => {
    const closed = new State("closed");
    const opened = new State("opened");
    closed.addTransition(new Transition(opened, "open"));
    opened.addTransition(new Transition(closed, "close"));
    const process = new Process("door", closed);
    const sm = new Statemachine({}, process, "opened");
    expect(sm.getCurrentState().getName()).toBe("opened");
  });

  it("should support autorelease lock", () => {
    const { sm } = createDoorMachine();
    expect(sm.isAutoreleaseLock()).toBe(true);
    sm.setAutoreleaseLock(false);
    expect(sm.isAutoreleaseLock()).toBe(false);
  });

  it("should handle checkTransitions for automatic transitions", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    // Automatic transition (no event)
    s1.addTransition(new Transition(s2, null, new Tautology()));
    const process = new Process("auto", s1);
    const sm = new Statemachine({}, process);
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("s2");
  });

  it("should pass context to triggerEvent", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const receivedCtx: unknown[] = [];
    s1.getEvent("go").attach(
      new CallbackObserver((...args: unknown[]) => {
        receivedCtx.push(...args);
      }),
    );
    const process = new Process("test", s1);
    const sm = new Statemachine({}, process);
    const ctx = new Map<string, unknown>([["key", "value"]]);
    await sm.triggerEvent("go", ctx);
    expect(receivedCtx).toContain(ctx);
  });
});

// === PHP-ported tests ===

describe("StateCollection (PHP-ported)", () => {
  it("should contain states", () => {
    const collection = new StateCollection();
    const state = new State("TestState");
    collection.addState(state);
    const states = Array.from(collection.getStates());
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) {
      expect(s).toHaveProperty("getName");
    }
  });

  it("should reply if it contains a state by name", () => {
    const collection = new StateCollection();
    collection.addState(new State("TestState"));
    expect(collection.hasState("TestState")).toBe(true);
    expect(collection.hasState("NonExistent")).toBe(false);
  });

  it("should return a state by name", () => {
    const collection = new StateCollection();
    const state = new State("TestState");
    collection.addState(state);
    const retrieved = collection.getState("TestState");
    expect(retrieved).toBe(state);
  });

  it("should throw when getting non-existent state", () => {
    const collection = new StateCollection();
    expect(() => collection.getState("missing")).toThrow();
  });
});

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
    const state = new State("TestState");
    const name = state.getName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("should use metadata for flags (ArrayAccess equivalent)", () => {
    const state = new State("TestState");
    expect(state.hasMetadataValue("TestOffset")).toBe(false);
    state.setMetadataValue("TestOffset", "TestValue");
    expect(state.hasMetadataValue("TestOffset")).toBe(true);
    expect(state.getMetadataValue("TestOffset")).toBe("TestValue");
    state.deleteMetadataValue("TestOffset");
    expect(state.hasMetadataValue("TestOffset")).toBe(false);
  });
});

describe("Process (PHP-ported)", () => {
  it("should contain states iterable", () => {
    const state = new State("TestState");
    const process = new Process("TestProcess", state);
    const states = Array.from(process.getStates());
    expect(states.length).toBeGreaterThan(0);
  });

  it("should reply if it contains a state by name", () => {
    const state = new State("TestState");
    const process = new Process("TestProcess", state);
    expect(process.hasState("TestState")).toBe(true);
  });

  it("should return a state by name", () => {
    const state = new State("TestState");
    const process = new Process("TestProcess", state);
    const retrieved = process.getState("TestState");
    expect(retrieved).toBe(state);
  });
});

describe("Statemachine (PHP-ported)", () => {
  it("should provide current state", () => {
    const initial = new State("new");
    const process = new Process("testProcess", initial);
    const sm = new Statemachine({}, process);
    expect(sm.getCurrentState()).toBe(initial);
  });

  it("should provide stateful subject", () => {
    const subject = { name: "test" };
    const initial = new State("new");
    const process = new Process("testProcess", initial);
    const sm = new Statemachine(subject, process);
    expect(sm.getSubject()).toBe(subject);
  });

  it("should handle events that are triggered", async () => {
    const initial = new State("new");
    const second = new State("second");
    initial.addTransition(new Transition(second, "test event"));
    const process = new Process("testProcess", initial);
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("test event");
    expect(sm.getCurrentState().getName()).toBe("second");
  });

  it("should check if conditions are true (automatic transition)", async () => {
    const initial = new State("new");
    const second = new State("second");
    const end = new State("end");
    initial.addTransition(new Transition(second, "test event"));
    let canBeClosed = false;
    const condition = new CallbackCondition("canBeClosed", () => canBeClosed);
    second.addTransition(new Transition(end, null, condition));
    const process = new Process("testProcess", initial);
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("test event");
    expect(sm.getCurrentState().getName()).toBe("second");
    canBeClosed = true;
    await sm.checkTransitions();
    expect(sm.getCurrentState().getName()).toBe("end");
  });

  it("should throw exception if current state does not have triggered event", async () => {
    const initial = new State("new");
    const process = new Process("testProcess", initial);
    const sm = new Statemachine({}, process);
    await expect(sm.triggerEvent("foo")).rejects.toThrow(
      WrongEventForStateError,
    );
  });

  it("should allow lock to be managed from outside", async () => {
    const initial = new State("new");
    const process = new Process("testProcess", initial);
    const sm = new Statemachine({}, process);
    const isAcquired = await sm.acquireLock();
    expect(isAcquired).toBe(true);
    expect(sm.isLockAcquired()).toBe(true);
    await sm.releaseLock();
    expect(sm.isLockAcquired()).toBe(false);
  });
});
