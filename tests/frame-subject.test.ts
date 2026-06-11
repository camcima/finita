import { describe, it, expect } from "vitest";
import { ProcessBuilder, Statemachine } from "../src/index.js";
import type { TransitionFrame } from "../src/index.js";

describe("TransitionFrame.subject", () => {
  it("exposes the machine's subject to before- and after-observers", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    const subject = { id: 42 };
    const sm = new Statemachine(subject, process);
    const seen: unknown[] = [];
    sm.attachBefore({
      notify(frame: TransitionFrame<typeof subject>): void {
        seen.push(frame.subject);
      },
    });
    sm.attachAfter({
      notify(frame: TransitionFrame<typeof subject>): void {
        seen.push(frame.subject);
      },
    });

    await sm.triggerEvent("go");
    expect(seen).toEqual([subject, subject]);
  });
});
