import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Factory,
  SingleProcessDetector,
  StatefulStateNameDetector,
  StatefulStatusChanger,
} from "../src/index.js";
import type { StatefulInterface } from "../src/index.js";

class Order implements StatefulInterface {
  private state = "a";
  getCurrentStateName(): string {
    return this.state;
  }
  setCurrentStateName(stateName: string): void {
    this.state = stateName;
  }
}

describe("StatefulStatusChanger shared via Factory", () => {
  it("persists each machine's state to its own subject", async () => {
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go" })
      .build();

    const factory = new Factory<Order>(
      new SingleProcessDetector(process),
      new StatefulStateNameDetector(),
    );
    // No constructor subject: the observer writes to frame.subject.
    factory.attachAfterObserver(new StatefulStatusChanger());

    const order1 = new Order();
    const order2 = new Order();
    const sm2 = await factory.createStatemachine(order2);
    await sm2.triggerEvent("go");

    expect(order2.getCurrentStateName()).toBe("b");
    expect(order1.getCurrentStateName()).toBe("a"); // untouched
  });
});
