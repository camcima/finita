import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
import type { TransitionFrame } from "../src/index.js";

const build = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();

describe("Statemachine observer registration is idempotent", () => {
  it("attaching the same before-observer twice notifies once", async () => {
    const sm = new Statemachine({}, build());
    let calls = 0;
    const observer = {
      notify: (_frame: TransitionFrame) => {
        calls += 1;
      },
    };
    sm.attachBefore(observer);
    sm.attachBefore(observer);
    await sm.triggerEvent("go");
    expect(calls).toBe(1);
  });

  it("attaching the same after-observer twice notifies once", async () => {
    const sm = new Statemachine({}, build());
    let calls = 0;
    const observer = {
      notify: () => {
        calls += 1;
      },
    };
    sm.attachAfter(observer);
    sm.attachAfter(observer);
    await sm.triggerEvent("go");
    expect(calls).toBe(1);
  });
});
