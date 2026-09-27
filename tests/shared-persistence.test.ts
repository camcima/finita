import { describe, it, expect } from "vitest";
import {
  Factory,
  LockAdapterMutex,
  ProcessBuilder,
  SingleProcessDetector,
  Statemachine,
  StatefulStateNameDetector,
  StatefulStatusChanger,
  WrongEventForStateError,
} from "../src/index.js";
import type { LockAdapterInterface, StatefulInterface } from "../src/index.js";

/**
 * Pins the ownership model documented in docs/mutex.md, "Locks and persisted
 * state": a lock serializes execution but does not refresh a machine's
 * state, so a machine must be built from state loaded inside the lock.
 */
const process = new ProcessBuilder("order")
  .addState("pending", { initial: true })
  .addState("approved")
  .addTransition("pending", "approved", { event: "approve" })
  .build();

class Order implements StatefulInterface {
  constructor(
    readonly id: string,
    private state: string,
  ) {}
  getCurrentStateName(): string {
    return this.state;
  }
  setCurrentStateName(name: string): void {
    this.state = name;
  }
}

/** Stand-in for a database table: loads return fresh copies. */
class OrderTable {
  private readonly rows = new Map<string, string>([["o1", "pending"]]);
  load(id: string): Order {
    return new Order(id, this.rows.get(id)!);
  }
  save(order: Order): void {
    this.rows.set(order.id, order.getCurrentStateName());
  }
}

/** Stand-in for a shared lock service such as Redis. */
const lockService = (): LockAdapterInterface => {
  const held = new Set<string>();
  return {
    acquireLock: async (name) => {
      if (held.has(name)) return false;
      held.add(name);
      return true;
    },
    releaseLock: async (name) => held.delete(name),
    isLocked: async (name) => held.has(name),
  };
};

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("locks and persisted state", () => {
  it("a lock alone does not stop two machines built from one snapshot", async () => {
    const table = new OrderTable();
    const locks = lockService();
    let effects = 0;
    const build = (order: Order) => {
      const sm = new Statemachine(order, process, {
        initialStateName: order.getCurrentStateName(),
        mutex: new LockAdapterMutex(locks, `order:${order.id}`),
      });
      sm.attachAfter({ notify: () => void effects++ });
      return sm;
    };

    // Both workers load before either runs.
    const first = build(table.load("o1"));
    const second = build(table.load("o1"));
    await first.triggerEvent("approve");
    await second.triggerEvent("approve");

    expect(effects).toBe(2);
  });

  it("loading inside the lock commits the transition exactly once", async () => {
    const table = new OrderTable();
    const locks = lockService();
    let effects = 0;

    const factory = new Factory<Order>(
      new SingleProcessDetector(process),
      new StatefulStateNameDetector(),
    );
    factory.attachAfterObserver(new StatefulStatusChanger());
    factory.attachAfterObserver({ notify: () => void effects++ });

    const approve = async (id: string): Promise<void> => {
      const resource = `order:${id}`;
      while (!(await locks.acquireLock(resource))) await tick();
      try {
        const order = table.load(id);
        const sm = await factory.createStatemachine(order);
        await sm.triggerEvent("approve");
        table.save(order);
      } finally {
        await locks.releaseLock(resource);
      }
    };

    const results = await Promise.allSettled([approve("o1"), approve("o1")]);

    expect(effects).toBe(1);
    expect(table.load("o1").getCurrentStateName()).toBe("approved");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      WrongEventForStateError,
    );
  });
});
