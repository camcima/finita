import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine, OnEnterObserver } from "../src/index.js";
import type {
  AfterTransitionObserver,
  BeforeTransitionObserver,
  EnqueueContext,
  TransitionFrame,
  ProposedTransitionFrame,
} from "../src/index.js";

describe("Observer frames and ordering (closes #2, #4)", () => {
  it("after-observer registered after OnEnterObserver sees original frame, not chained (#2)", async () => {
    const observed: { from: string; to: string }[] = [];

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);

    sm.attachAfter(new OnEnterObserver());
    sm.attachAfter({
      notify(frame: TransitionFrame): void {
        observed.push({
          from: frame.fromState.getName(),
          to: frame.toState.getName(),
        });
      },
    });

    await sm.triggerEvent("go");
    // Yield to allow the queued chained onEnter event to run as its own
    // top-level operation before asserting.
    await new Promise((r) => setTimeout(r, 0));

    // Two transitions happened: a→b (event "go") and b→c (event "onEnter").
    // Each one's after-observer pass sees its own frame; the recorder runs
    // once per transition with that transition's frame.
    expect(observed).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(sm.getCurrentState().getName()).toBe("c");
  });

  it("on-enter chained event runs as its own top-level operation", async () => {
    let chainedSawFromB = false;

    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addState("c")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "c", { event: "onEnter" })
      .build();
    const sm = new Statemachine({}, process);

    sm.attachAfter(new OnEnterObserver());
    sm.attachAfter({
      notify(frame: TransitionFrame): void {
        if (frame.event?.getName() === "onEnter") {
          chainedSawFromB = frame.fromState.getName() === "b";
        }
      },
    });

    await sm.triggerEvent("go");
    // Yield so the queued chained onEnter operation runs.
    await new Promise((r) => setTimeout(r, 0));

    expect(chainedSawFromB).toBe(true);
  });

  it("frame is frozen", async () => {
    let captured: TransitionFrame | null = null;
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(frame: TransitionFrame): void {
        captured = frame;
      },
    });
    await sm.triggerEvent("go");
    expect(Object.isFrozen(captured!)).toBe(true);
  });

  it("BeforeTransitionObserver may veto by throwing (#4)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    let afterCalled = false;
    sm.attachBefore({
      notify(_frame: ProposedTransitionFrame): void {
        throw new Error("veto");
      },
    });
    sm.attachAfter({
      notify(_frame: TransitionFrame): void {
        afterCalled = true;
      },
    });
    await expect(sm.triggerEvent("go")).rejects.toThrow("veto");
    expect(sm.getCurrentState().getName()).toBe("a");
    expect(afterCalled).toBe(false);
  });

  it("AfterTransitionObserver throw does not roll back state (#4)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_frame: TransitionFrame): void {
        throw new Error("kaboom");
      },
    });
    await expect(sm.triggerEvent("go")).rejects.toThrow("kaboom");
    expect(sm.getCurrentState().getName()).toBe("b");
    expect(sm.getLastState()!.getName()).toBe("a");
  });

  it("multiple after-observers all run; AggregateError when more than one throws", async () => {
    const calls: string[] = [];
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        calls.push("o1");
        throw new Error("e1");
      },
    });
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        calls.push("o2");
      },
    });
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        calls.push("o3");
        throw new Error("e3");
      },
    });
    let caught: unknown;
    try {
      await sm.triggerEvent("go");
    } catch (err) {
      caught = err;
    }
    expect(calls).toEqual(["o1", "o2", "o3"]);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(2);
    expect((caught as AggregateError).errors[0]!.message).toBe("e1");
    expect((caught as AggregateError).errors[1]!.message).toBe("e3");
  });

  it("single after-observer throw rethrown directly (not wrapped)", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachAfter({
      notify(_f: TransitionFrame): void {
        throw new Error("only-one");
      },
    });
    let caught: unknown;
    try {
      await sm.triggerEvent("go");
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(AggregateError);
    expect((caught as Error).message).toBe("only-one");
  });

  it("BeforeTransitionObserver fires on the happy path with a frozen frame", async () => {
    const seen: ProposedTransitionFrame[] = [];
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    const observer: BeforeTransitionObserver = {
      notify(frame: ProposedTransitionFrame): void {
        seen.push(frame);
      },
    };
    sm.attachBefore(observer);

    await sm.triggerEvent("go");

    expect(seen).toHaveLength(1);
    expect(seen[0].fromState.getName()).toBe("a");
    expect(seen[0].toState.getName()).toBe("b");
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("multiple before-observers run in attach order until one throws", async () => {
    const order: string[] = [];
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);
    sm.attachBefore({
      notify(): void {
        order.push("first");
      },
    });
    sm.attachBefore({
      notify(): void {
        order.push("second");
        throw new Error("veto-second");
      },
    });
    sm.attachBefore({
      notify(): void {
        order.push("third"); // should not run — second already threw
      },
    });

    await expect(sm.triggerEvent("go")).rejects.toThrow("veto-second");
    expect(order).toEqual(["first", "second"]);
    expect(sm.getCurrentState().getName()).toBe("a");
  });

  it("detachBefore stops a previously attached before-observer from firing", async () => {
    let calls = 0;
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "a", { event: "back" })
      .build();
    const sm = new Statemachine({}, process);
    const observer: BeforeTransitionObserver = {
      notify(): void {
        calls++;
      },
    };
    sm.attachBefore(observer);
    await sm.triggerEvent("go"); // a -> b, observer fires once
    expect(calls).toBe(1);

    sm.detachBefore(observer);
    await sm.triggerEvent("back"); // b -> a, observer should NOT fire
    expect(calls).toBe(1);

    // Detaching an observer that was never attached is a no-op.
    sm.detachBefore({ notify(): void {} });
  });

  it("detachAfter stops a previously attached after-observer from firing", async () => {
    let calls = 0;
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .addTransition("b", "a", { event: "back" })
      .build();
    const sm = new Statemachine({}, process);
    const observer: AfterTransitionObserver = {
      notify(): void {
        calls++;
      },
    };
    sm.attachAfter(observer);
    await sm.triggerEvent("go");
    expect(calls).toBe(1);

    sm.detachAfter(observer);
    await sm.triggerEvent("back");
    expect(calls).toBe(1);

    sm.detachAfter({ notify(): void {} });
  });

  it("getBeforeObservers exposes attached before-observers", () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    const sm = new Statemachine({}, process);

    expect(Array.from(sm.getBeforeObservers())).toEqual([]);

    const o1: BeforeTransitionObserver = { notify(): void {} };
    const o2: BeforeTransitionObserver = { notify(): void {} };
    sm.attachBefore(o1);
    sm.attachBefore(o2);
    expect(Array.from(sm.getBeforeObservers())).toEqual([o1, o2]);

    sm.detachBefore(o1);
    expect(Array.from(sm.getBeforeObservers())).toEqual([o2]);
  });
});

// Suppress unused import warnings.
void (undefined as unknown as AfterTransitionObserver);
void (undefined as unknown as BeforeTransitionObserver);
void (undefined as unknown as EnqueueContext);
