import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  CallbackObserver,
} from "../src/index.js";
import type { AfterTransitionObserver } from "../src/index.js";

const build = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go" })
    .build();

describe("observer accessors hand out snapshots, not live collections", () => {
  it("an already-returned after-observer list is unaffected by a later detach", () => {
    const sm = new Statemachine({}, build());
    const first: AfterTransitionObserver = { notify: () => {} };
    const second: AfterTransitionObserver = { notify: () => {} };
    sm.attachAfter(first);
    sm.attachAfter(second);

    const observers = sm.getAfterObservers();
    sm.detachAfter(second);

    expect([...observers]).toHaveLength(2);
    expect([...sm.getAfterObservers()]).toHaveLength(1);
  });

  it("an already-returned before-observer list is unaffected by a later detach", () => {
    const sm = new Statemachine({}, build());
    const first = { notify: () => {} };
    const second = { notify: () => {} };
    sm.attachBefore(first);
    sm.attachBefore(second);

    const observers = sm.getBeforeObservers();
    sm.detachBefore(second);

    expect([...observers]).toHaveLength(2);
    expect([...sm.getBeforeObservers()]).toHaveLength(1);
  });

  it("an already-returned event observer list is unaffected by a later detach", () => {
    const process = build();
    const event = process.getState("a").getEvent("go");
    const first = new CallbackObserver(() => {});
    const second = new CallbackObserver(() => {});
    event.attach(first);
    event.attach(second);

    const observers = event.getObservers();
    event.detach(second);

    expect([...observers]).toHaveLength(2);
    expect([...event.getObservers()]).toHaveLength(1);
  });

  it("mutating a returned list does not change the machine's observers", async () => {
    const sm = new Statemachine({}, build());
    let calls = 0;
    sm.attachAfter({
      notify: () => {
        calls += 1;
      },
    });

    // A caller that casts the Iterable back to an array must not be able to
    // clear the engine's own registrations.
    (sm.getAfterObservers() as AfterTransitionObserver[]).length = 0;

    await sm.triggerEvent("go");
    expect(calls).toBe(1);
  });
});
