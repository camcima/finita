import { describe, it, expect } from "vitest";
import { ProcessBuilder, CallbackObserver, Event } from "../src/index.js";

describe("CallbackObserver argument forwarding", () => {
  const buildEvent = () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();
    return process.getState("a").getEvent("go");
  };

  it("receives zero arguments when the event is invoked with none", async () => {
    const event = buildEvent();
    let receivedArgs: unknown[] | null = null;
    event.attach(
      new CallbackObserver((...args) => {
        receivedArgs = args;
      }),
    );
    await event.invoke();
    // invoke() with no args → callback called with zero args, NOT the event.
    expect(receivedArgs).toEqual([]);
  });

  it("receives the invoke args when the event is invoked with them", async () => {
    const event = buildEvent();
    let receivedArgs: unknown[] | null = null;
    event.attach(
      new CallbackObserver((...args) => {
        receivedArgs = args;
      }),
    );
    await event.invoke("x", 42);
    expect(receivedArgs).toEqual(["x", 42]);
  });

  it("receives the subject itself on a direct legacy update(subject) call", async () => {
    const event = buildEvent();
    let receivedArgs: unknown[] | null = null;
    const observer = new CallbackObserver((...args) => {
      receivedArgs = args;
    });
    await observer.update(event);
    expect(receivedArgs).toEqual([event]);
  });

  it("forwards undefined (not []) to observers on a direct notify() with no args", async () => {
    // invoke() always supplies a (possibly empty) array; a bare notify() means
    // "no args supplied", which must reach observers as undefined so they can
    // tell it apart from an explicit zero-arg invoke. CallbackObserver maps the
    // former to its legacy update(subject) path.
    const event = new Event("e");
    let receivedArgs: unknown[] | null = null;
    event.attach(
      new CallbackObserver((...args) => {
        receivedArgs = args;
      }),
    );
    await event.notify();
    expect(receivedArgs).toEqual([event]);
  });
});
