import { describe, it, expect, vi } from "vitest";
import {
  State,
  Transition,
  Process,
  Statemachine,
  CallbackCondition,
  AndComposite,
  OrComposite,
  Not,
  Factory,
  SingleProcessDetector,
  MutexFactory,
  OneOrNoneActiveTransition,
  ScoreTransition,
  WeightTransition,
} from "../src/index.js";
import type {
  ConditionInterface,
  TransitionInterface,
  LockAdapterInterface,
  ConditionCallbackFn,
  StringConverter,
} from "../src/index.js";

interface Order {
  id: number;
  status: string;
  total: number;
}

describe("Generics - typed subject", () => {
  function buildOrderProcess() {
    const pending = new State("pending");
    const approved = new State("approved");
    const rejected = new State("rejected");

    const approveCondition = new CallbackCondition<Order>(
      "canApprove",
      (order) => order.total <= 1000,
    );
    const rejectCondition = new Not<Order>(approveCondition);

    pending.addTransition(new Transition(approved, "review", approveCondition));
    pending.addTransition(new Transition(rejected, "review", rejectCondition));

    return new Process("order", pending);
  }

  it("should create typed statemachine with typed subject access", () => {
    const process = buildOrderProcess();
    const order: Order = { id: 1, status: "pending", total: 500 };
    const sm = new Statemachine<Order>(order, process);

    const subject: Order = sm.getSubject();
    expect(subject.id).toBe(1);
    expect(subject.total).toBe(500);
    expect(sm.getCurrentState().getName()).toBe("pending");
  });

  it("should use typed callback condition", async () => {
    const condition = new CallbackCondition<Order>(
      "isExpensive",
      (order) => order.total > 500,
    );

    const order: Order = { id: 1, status: "pending", total: 1000 };
    expect(await condition.checkCondition(order, new Map())).toBe(true);

    const cheapOrder: Order = { id: 2, status: "pending", total: 100 };
    expect(await condition.checkCondition(cheapOrder, new Map())).toBe(false);
  });

  it("should preserve type through composite conditions", async () => {
    const expensive = new CallbackCondition<Order>(
      "expensive",
      (order) => order.total > 500,
    );
    const hasId = new CallbackCondition<Order>(
      "hasId",
      (order) => order.id > 0,
    );

    const andCondition = new AndComposite<Order>(expensive);
    andCondition.addAnd(hasId);

    const order: Order = { id: 1, status: "pending", total: 1000 };
    expect(await andCondition.checkCondition(order, new Map())).toBe(true);

    const orCondition = new OrComposite<Order>(expensive);
    orCondition.addOr(hasId);

    const cheapOrder: Order = { id: 1, status: "pending", total: 100 };
    expect(await orCondition.checkCondition(cheapOrder, new Map())).toBe(true);
  });

  it("should preserve type through Not condition", async () => {
    const expensive = new CallbackCondition<Order>(
      "expensive",
      (order) => order.total > 500,
    );
    const notExpensive = new Not<Order>(expensive);

    const order: Order = { id: 1, status: "pending", total: 100 };
    expect(await notExpensive.checkCondition(order, new Map())).toBe(true);
  });

  it("should transition with typed conditions", async () => {
    const process = buildOrderProcess();
    const order: Order = { id: 1, status: "pending", total: 500 };
    const sm = new Statemachine<Order>(order, process);

    await sm.triggerEvent("review");
    expect(sm.getCurrentState().getName()).toBe("approved");
  });

  it("should reject orders over limit", async () => {
    const process = buildOrderProcess();
    const order: Order = { id: 2, status: "pending", total: 2000 };
    const sm = new Statemachine<Order>(order, process);

    await sm.triggerEvent("review");
    expect(sm.getCurrentState().getName()).toBe("rejected");
  });

  it("should work with typed factory", async () => {
    const pending = new State("pending");
    const approved = new State("approved");
    pending.addTransition(new Transition(approved, "approve"));
    const process = new Process("order", pending);

    const factory = new Factory<Order>(
      new SingleProcessDetector<Order>(process),
    );
    const sm = await factory.createStatemachine({
      id: 1,
      status: "pending",
      total: 500,
    });

    const subject: Order = sm.getSubject();
    expect(subject.id).toBe(1);
  });

  it("should work with typed transition selector", () => {
    const selector = new OneOrNoneActiveTransition<Order>();
    const result = selector.selectTransition([]);
    expect(result).toBeNull();
  });

  it("should work with typed score transition", () => {
    const selector = new ScoreTransition<Order>();
    const result = selector.selectTransition([]);
    expect(result).toBeNull();
  });

  it("should work with typed weight transition", () => {
    const selector = new WeightTransition<Order>();
    const result = selector.selectTransition([]);
    expect(result).toBeNull();
  });

  it("should work with typed MutexFactory", () => {
    const lockAdapter: LockAdapterInterface = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(undefined),
      isLocked: vi.fn().mockReturnValue(false),
    };
    const converter: StringConverter<Order> = (order) =>
      `order-${order.id}`;
    const factory = new MutexFactory<Order>(lockAdapter, converter);
    const mutex = factory.createMutex({ id: 42, status: "pending", total: 0 });
    expect(mutex).toBeDefined();
  });
});

describe("Generics - backward compatibility", () => {
  it("should work without explicit type parameter (defaults to unknown)", () => {
    const state = new State("s1");
    const process = new Process("test", state);
    const sm = new Statemachine({}, process);
    expect(sm.getCurrentState().getName()).toBe("s1");
  });

  it("should allow untyped CallbackCondition", async () => {
    const condition = new CallbackCondition("always", () => true);
    expect(await condition.checkCondition("anything", new Map())).toBe(true);
  });

  it("should allow untyped Factory", async () => {
    const state = new State("s1");
    const process = new Process("test", state);
    const factory = new Factory(new SingleProcessDetector(process));
    const sm = await factory.createStatemachine({});
    expect(sm.getCurrentState().getName()).toBe("s1");
  });
});

describe("Generics - type assignability", () => {
  it("should accept ConditionInterface<Order> where generic is expected", () => {
    const condition: ConditionInterface<Order> = new CallbackCondition<Order>(
      "test",
      (order) => order.total > 0,
    );
    const transition: TransitionInterface<Order> = new Transition<Order>(
      new State("s1"),
      "go",
      condition,
    );
    expect(transition.getConditionName()).toBe("test");
  });

  it("should type callback function parameter", () => {
    const fn: ConditionCallbackFn<Order> = (order) => order.total > 100;
    const condition = new CallbackCondition<Order>("test", fn);
    expect(condition.getName()).toBe("test");
  });
});
