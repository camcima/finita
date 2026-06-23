import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  CallbackObserver,
} from "../src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Event invoke args under concurrent machines sharing one Process", () => {
  it("each machine's event observers receive that machine's subject", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    const received: unknown[] = [];
    // Event objects live on the shared Process — one observer serves both machines.
    process
      .getState("a")
      .getEvent("go")
      .attach(
        new CallbackObserver(async (subject) => {
          await sleep(10); // interleaving window
          received.push(subject);
        }),
      );

    const subjectA = { name: "A" };
    const subjectB = { name: "B" };
    const smA = new Statemachine(subjectA, process);
    const smB = new Statemachine(subjectB, process);

    await Promise.all([smA.triggerEvent("go"), smB.triggerEvent("go")]);

    expect(received).toHaveLength(2);
    expect(received).toContain(subjectA);
    expect(received).toContain(subjectB);
  });

  it("a later observer still sees its own machine's args after an earlier observer awaits", async () => {
    // This is the discriminating regression for the original race: with the
    // old shared invokeArgs field, observer 1's await opened a window in
    // which the OTHER machine's invoke() overwrote the field, so observer 2
    // (reading at call time) received the wrong machine's subject or [].
    // With args passed per-call, observer 2 always gets its own machine's.
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    const event = process.getState("a").getEvent("go");
    // Observer 1: awaits, opening the interleaving window.
    event.attach(
      new CallbackObserver(async () => {
        await sleep(10);
      }),
    );
    // Observer 2: records the subject it was invoked with.
    const received: unknown[] = [];
    event.attach(
      new CallbackObserver((subject) => {
        received.push(subject);
      }),
    );

    const subjectA = { name: "A" };
    const subjectB = { name: "B" };
    const smA = new Statemachine(subjectA, process);
    const smB = new Statemachine(subjectB, process);

    await Promise.all([smA.triggerEvent("go"), smB.triggerEvent("go")]);

    expect(received).toHaveLength(2);
    expect(received).toContain(subjectA);
    expect(received).toContain(subjectB);
  });
});
