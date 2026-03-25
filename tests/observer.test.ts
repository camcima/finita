import { describe, it, expect, vi } from "vitest";
import {
  State,
  Transition,
  Process,
  Event,
  Statemachine,
  StateCollection,
  SetupHelper,
  CallbackObserver,
  StatefulStatusChanger,
  OnEnterObserver,
  TransitionLogger,
} from "../src/index.js";
import type { StatefulInterface, LoggerInterface } from "../src/index.js";

describe("CallbackObserver", () => {
  it("should call the callback with event invoke args", async () => {
    const fn = vi.fn();
    const observer = new CallbackObserver(fn);
    const event = new Event("test");
    event.attach(observer);
    await event.invoke("a", "b");
    expect(fn).toHaveBeenCalledWith("a", "b");
  });
});

describe("StatefulStatusChanger", () => {
  it("should update subject state name on transition", async () => {
    const subject: StatefulInterface = {
      getCurrentStateName: () => "closed",
      setCurrentStateName: vi.fn(),
    };
    const closed = new State("closed");
    const opened = new State("opened");
    closed.addTransition(new Transition(opened, "open"));
    opened.addTransition(new Transition(closed, "close"));
    const process = new Process("door", closed);
    const sm = new Statemachine(subject, process);
    sm.attach(new StatefulStatusChanger());
    await sm.triggerEvent("open");
    expect(subject.setCurrentStateName).toHaveBeenCalledWith("opened");
  });
});

describe("OnEnterObserver", () => {
  it("should trigger onEnter event when entering a state", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));

    const fn = vi.fn();
    // Create an onEnter event on s2 with a self-transition
    s2.addTransition(new Transition(s2, "onEnter"));
    s2.getEvent("onEnter").attach(new CallbackObserver(fn));

    const process = new Process("test", s1);
    const sm = new Statemachine({}, process);
    sm.attach(new OnEnterObserver());
    await sm.triggerEvent("go");
    expect(fn).toHaveBeenCalled();
  });

  it("should not trigger if state has no onEnter event", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const process = new Process("test", s1);
    const sm = new Statemachine({}, process);
    sm.attach(new OnEnterObserver());
    // Should not throw
    await sm.triggerEvent("go");
    expect(sm.getCurrentState().getName()).toBe("s2");
  });

  it("should support custom event name", async () => {
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));

    const fn = vi.fn();
    s2.addTransition(new Transition(s2, "myEnter"));
    s2.getEvent("myEnter").attach(new CallbackObserver(fn));

    const process = new Process("test", s1);
    const sm = new Statemachine({}, process);
    sm.attach(new OnEnterObserver("myEnter"));
    await sm.triggerEvent("go");
    expect(fn).toHaveBeenCalled();
  });
});

describe("TransitionLogger", () => {
  it("should log transitions", async () => {
    const logger: LoggerInterface = { log: vi.fn() };
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    const process = new Process("test", s1);
    const sm = new Statemachine({}, process);
    sm.attach(new TransitionLogger(logger));
    await sm.triggerEvent("go");
    expect(logger.log).toHaveBeenCalled();
    const [level, message] = (logger.log as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(level).toBe("info");
    expect(message).toContain("Transition");
    expect(message).toContain("s2");
  });
});

// === PHP-ported tests ===

describe("StatefulStatusChanger (PHP-ported)", () => {
  it("should change status on stateful objects via direct update", () => {
    const stateName = "stateName";
    const state = new State(stateName);
    const process = new Process("process", state);
    let currentStateName = "";
    const subject: StatefulInterface = {
      getCurrentStateName: () => currentStateName,
      setCurrentStateName: (name: string) => {
        currentStateName = name;
      },
    };
    const sm = new Statemachine(subject, process);
    const observer = new StatefulStatusChanger();
    observer.update(sm);
    expect(currentStateName).toBe(stateName);
  });
});

describe("OnEnterObserver (PHP-ported)", () => {
  it("should trigger event if state is changed and new state has registered event (using SetupHelper)", async () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    helper.findOrCreateTransition("initial", "second", "go");
    helper.findOrCreateTransition("second", "error", "error");
    const eventName = "eventName";
    helper.findOrCreateTransition("second", "final", eventName);
    const process = new Process("process_name", collection.getState("initial"));

    const subject = {};
    const sm = new Statemachine(subject, process);
    sm.attach(new OnEnterObserver(eventName));
    await sm.triggerEvent("go");

    expect(sm.getCurrentState().getName()).toBe("final");
  });
});

describe("TransitionLogger (PHP-ported)", () => {
  it("should log with named subject, exact message format and context", () => {
    const subject = { getName: () => "SubjectName" };
    const state = new State("stateName");
    const process = new Process("process", state);
    const sm = new Statemachine(subject, process);

    const logger: LoggerInterface = { log: vi.fn() };
    const observer = new TransitionLogger(logger);
    observer.update(sm);

    expect(logger.log).toHaveBeenCalledTimes(1);
    const [level, message, context] = (logger.log as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(level).toBe("info");
    expect(message).toBe('Transition for "SubjectName" to "stateName"');
    expect(context).toHaveProperty("subject", subject);
    expect(context).toHaveProperty("currentState", state);
    expect(context).toHaveProperty("lastState", null);
    expect(context).toHaveProperty("transition", null);
  });
});
