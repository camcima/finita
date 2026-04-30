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
});

// Suppress unused import warnings.
void (undefined as unknown as AfterTransitionObserver);
void (undefined as unknown as BeforeTransitionObserver);
void (undefined as unknown as EnqueueContext);
