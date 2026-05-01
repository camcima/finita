import { describe, it, expect, vi } from "vitest";
import {
  Event,
  Statemachine,
  ProcessBuilder,
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
    const process = new ProcessBuilder("door")
      .addState("closed", { initial: true })
      .addState("opened")
      .addTransition("closed", "opened", { event: "open" })
      .addTransition("opened", "closed", { event: "close" })
      .build();
    const sm = new Statemachine(subject, process);
    sm.attachAfter(new StatefulStatusChanger(subject));
    await sm.triggerEvent("open");
    expect(subject.setCurrentStateName).toHaveBeenCalledWith("opened");
  });
});

describe("OnEnterObserver", () => {
  it("should enqueue and eventually fire the onEnter event", async () => {
    // In v3, OnEnterObserver enqueues triggerEvent("onEnter") as a separate op.
    // The chained op runs after the current runIfIdle call settles — a brief
    // microtask yield lets the event loop drain the queue.
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .addState("s2")
      .addState("s3")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s2", "s3", { event: "onEnter" })
      .build();

    const fn = vi.fn();
    process.getState("s2").getEvent("onEnter").attach(new CallbackObserver(fn));

    const sm = new Statemachine({}, process);
    sm.attachAfter(new OnEnterObserver());
    await sm.triggerEvent("go");
    // Yield to allow the enqueued chained op to run.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(sm.getCurrentState().getName()).toBe("s3");
    expect(fn).toHaveBeenCalled();
  });

  it("should not trigger if state has no onEnter event", async () => {
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new OnEnterObserver());
    // Should not throw
    await sm.triggerEvent("go");
    expect(sm.getCurrentState().getName()).toBe("s2");
  });

  it("should support custom event name", async () => {
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .addState("s2")
      .addState("s3")
      .addTransition("s1", "s2", { event: "go" })
      .addTransition("s2", "s3", { event: "myEnter" })
      .build();

    const fn = vi.fn();
    process.getState("s2").getEvent("myEnter").attach(new CallbackObserver(fn));

    const sm = new Statemachine({}, process);
    sm.attachAfter(new OnEnterObserver("myEnter"));
    await sm.triggerEvent("go");
    // Yield to allow the enqueued chained op to run.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(sm.getCurrentState().getName()).toBe("s3");
    expect(fn).toHaveBeenCalled();
  });
});

describe("TransitionLogger", () => {
  it("should log transitions", async () => {
    const logger: LoggerInterface = { log: vi.fn() };
    const process = new ProcessBuilder("test")
      .addState("s1", { initial: true })
      .addState("s2")
      .addTransition("s1", "s2", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter(new TransitionLogger(logger));
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
  it("should change status on stateful objects via after-transition observer", async () => {
    let currentStateName = "";
    const subject: StatefulInterface = {
      getCurrentStateName: () => currentStateName,
      setCurrentStateName: (name: string) => {
        currentStateName = name;
      },
    };
    // Build a process with one state so we can trigger a checkTransitions
    // that has no eligible automatic transition — just verify the observer
    // can be attached and notify is wired up correctly.
    const process = new ProcessBuilder("process")
      .addState("stateName", { initial: true })
      .addState("other")
      .addTransition("stateName", "other", { event: "go" })
      .build();
    const sm = new Statemachine(subject, process);
    sm.attachAfter(new StatefulStatusChanger(subject));
    await sm.triggerEvent("go");
    expect(currentStateName).toBe("other");
  });
});

describe("OnEnterObserver (PHP-ported)", () => {
  it("should trigger event if state is changed and new state has registered event", async () => {
    const eventName = "eventName";
    const process = new ProcessBuilder("process_name")
      .addState("initial", { initial: true })
      .addState("second")
      .addState("final")
      .addState("error")
      .addTransition("initial", "second", { event: "go" })
      .addTransition("second", "error", { event: "error" })
      .addTransition("second", "final", { event: eventName })
      .build();

    const subject = {};
    const sm = new Statemachine(subject, process);
    sm.attachAfter(new OnEnterObserver(eventName));
    await sm.triggerEvent("go");
    // Yield to allow the enqueued chained op (eventName → final) to run.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(sm.getCurrentState().getName()).toBe("final");
  });
});

describe("TransitionLogger (PHP-ported)", () => {
  it("should log with from/to state names and transition info", async () => {
    const process = new ProcessBuilder("process")
      .addState("stateName", { initial: true })
      .addState("other")
      .addTransition("stateName", "other", { event: "go" })
      .build();
    // In v3, TransitionLogger reads from the frame (no subject field in log context).
    const sm = new Statemachine({}, process);

    const logger: LoggerInterface = { log: vi.fn() };
    sm.attachAfter(new TransitionLogger(logger));
    await sm.triggerEvent("go");

    expect(logger.log).toHaveBeenCalledTimes(1);
    const [level, message, context] = (logger.log as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(level).toBe("info");
    // v3 message format: 'Transition from "stateName" to "other" with event "go"'
    expect(message).toContain("Transition");
    expect(message).toContain("stateName");
    expect(message).toContain("other");
    // v3 frame-based context: fromState, toState, event, transition, machineName
    expect(context).toHaveProperty("fromState");
    expect(context).toHaveProperty("toState");
    expect(context).toHaveProperty("transition");
    // v3 does NOT include a "subject" field — subject identity is not on the frame
    expect(context).not.toHaveProperty("subject");
    expect(context).not.toHaveProperty("currentState");
    expect(context).not.toHaveProperty("lastState");
  });
});
