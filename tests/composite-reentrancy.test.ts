import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  ReentrancyError,
  AndComposite,
  OrComposite,
  Not,
  CallbackCondition,
  Tautology,
  Contradiction,
} from "../src/index.js";
import type { ConditionInterface } from "../src/index.js";

/**
 * Composite conditions used to await every child, even a plain boolean, so
 * any child after the first ran outside the machine's synchronous re-entrancy
 * guard: a re-entrant call there deadlocked instead of throwing. Synchronous
 * children must now stay inside the guard.
 */
type Reenter = (sm: Statemachine) => Promise<unknown>;

const reentrants: Array<[string, Reenter]> = [
  ["triggerEvent", (sm) => sm.triggerEvent("go")],
  ["checkTransitions", (sm) => sm.checkTransitions()],
  ["whenIdle", (sm) => sm.whenIdle()],
];

const machineWith = (
  makeCondition: (child: ConditionInterface) => ConditionInterface,
  reenter: Reenter,
): Statemachine => {
  const holder: { sm?: Statemachine } = {};
  const child = new CallbackCondition("reenter", () =>
    reenter(holder.sm!).then(() => true),
  );
  const process = new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addTransition("a", "b", { event: "go", condition: makeCondition(child) })
    .build();
  holder.sm = new Statemachine({}, process);
  return holder.sm;
};

const composites: Array<
  [string, (child: ConditionInterface) => ConditionInterface]
> = [
  ["second AND child", (c) => new AndComposite(new Tautology()).addAnd(c)],
  ["second OR child", (c) => new OrComposite(new Contradiction()).addOr(c)],
  [
    "nested AND inside OR",
    (c) =>
      new OrComposite(new Contradiction()).addOr(
        new AndComposite(new Tautology()).addAnd(c),
      ),
  ],
  [
    "child of Not after a sync sibling",
    (c) => new AndComposite(new Tautology()).addAnd(new Not(c)),
  ],
  [
    "sibling after a nested composite",
    (c) =>
      new AndComposite(
        new OrComposite(new Contradiction()).addOr(new Tautology()),
      ).addAnd(c),
  ],
  [
    "sibling after a Not",
    (c) => new AndComposite(new Not(new Contradiction())).addAnd(c),
  ],
];

describe("re-entrancy detection inside composite conditions", () => {
  for (const [where, makeCondition] of composites) {
    for (const [op, reenter] of reentrants) {
      it(`rejects ${op} from a ${where}`, async () => {
        const sm = machineWith(makeCondition, reenter);
        await expect(sm.triggerEvent("go")).rejects.toBeInstanceOf(
          ReentrancyError,
        );
      }, 1000);
    }
  }

  it("still evaluates async children, and in order", async () => {
    const seen: string[] = [];
    const child = (name: string, result: boolean): ConditionInterface =>
      new CallbackCondition(name, async () => {
        seen.push(name);
        return result;
      });
    const condition = new AndComposite(child("one", true))
      .addAnd(new Tautology())
      .addAnd(child("two", true));
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", condition })
      .build();
    const sm = new Statemachine({}, process);
    await sm.triggerEvent("go");
    expect(seen).toEqual(["one", "two"]);
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("does not reject an unrelated external caller while an async child is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const condition = new AndComposite(
      new CallbackCondition("slow", async () => {
        await gate;
        return true;
      }),
    ).addAnd(new Tautology());
    const process = new ProcessBuilder("p")
      .addState("a", { initial: true })
      .addState("b")
      .addTransition("a", "b", { event: "go", condition })
      .build();
    const sm = new Statemachine({}, process);
    const first = sm.triggerEvent("go");
    await Promise.resolve();
    const external = sm.checkTransitions();
    release();
    await expect(Promise.all([first, external])).resolves.toBeDefined();
  });
});
