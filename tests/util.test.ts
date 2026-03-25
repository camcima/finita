import { describe, it, expect, vi } from "vitest";
import {
  State,
  Transition,
  StateCollection,
  SetupHelper,
  StateCollectionMerger,
  CallbackObserver,
  CallbackCondition,
  Tautology,
} from "../src/index.js";
import type {
  TransitionInterface,
  StateInterface,
  EventInterface,
  ConditionInterface,
} from "../src/index.js";

describe("SetupHelper", () => {
  it("should find or create states", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    const s1 = helper.findOrCreateState("s1");
    expect(s1.getName()).toBe("s1");
    expect(collection.hasState("s1")).toBe(true);
    // Should return same instance
    expect(helper.findOrCreateState("s1")).toBe(s1);
  });

  it("should find or create transitions", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    const t = helper.findOrCreateTransition("s1", "s2", "go");
    expect(t.getTargetState().getName()).toBe("s2");
    expect(t.getEventName()).toBe("go");
    // Should return same instance
    expect(helper.findOrCreateTransition("s1", "s2", "go")).toBe(t);
  });

  it("should add commands", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    helper.findOrCreateState("s1");
    const fn = vi.fn();
    helper.addCommand("s1", "doSomething", new CallbackObserver(fn));
    const state = collection.getState("s1");
    expect(state.hasEvent("doSomething")).toBe(true);
  });

  it("should add command and self-transition", () => {
    const collection = new StateCollection();
    const helper = new SetupHelper(collection);
    helper.findOrCreateState("s1");
    const fn = vi.fn();
    helper.addCommandAndSelfTransition(
      "s1",
      "doSomething",
      new CallbackObserver(fn),
    );
    const state = collection.getState("s1");
    const transitions = Array.from(state.getTransitions());
    expect(
      transitions.some(
        (t) =>
          t.getTargetState() === state && t.getEventName() === "doSomething",
      ),
    ).toBe(true);
  });
});

describe("StateCollectionMerger", () => {
  it("should merge states from source to target", () => {
    const source = new StateCollection();
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new Transition(s2, "go"));
    source.addState(s1);
    source.addState(s2);

    const target = new StateCollection();
    const merger = new StateCollectionMerger(target);
    merger.merge(source);

    expect(target.hasState("s1")).toBe(true);
    expect(target.hasState("s2")).toBe(true);
  });

  it("should support state name prefix", () => {
    const source = new StateCollection();
    source.addState(new State("s1"));

    const target = new StateCollection();
    const merger = new StateCollectionMerger(target);
    merger.setStateNamePrefix("sub_");
    merger.merge(source);

    expect(target.hasState("sub_s1")).toBe(true);
    expect(target.hasState("s1")).toBe(false);
  });

  it("should merge metadata", () => {
    const source = new StateCollection();
    const s1 = new State("s1");
    s1.setMetadataValue("color", "red");
    source.addState(s1);

    const target = new StateCollection();
    const merger = new StateCollectionMerger(target);
    merger.merge(source);

    const merged = target.getState("s1");
    expect(merged.getMetadataValue("color")).toBe("red");
  });

  it("should merge event observers", () => {
    const source = new StateCollection();
    const s1 = new State("s1");
    const fn = vi.fn();
    s1.getEvent("myEvent").attach(new CallbackObserver(fn));
    source.addState(s1);

    const target = new StateCollection();
    const merger = new StateCollectionMerger(target);
    merger.merge(source);

    const mergedState = target.getState("s1");
    const observers = Array.from(
      mergedState.getEvent("myEvent").getObservers(),
    );
    expect(observers).toHaveLength(1);
  });
});

// === PHP-ported tests ===

describe("StateCollectionMerger (PHP-ported)", () => {
  const FLAG_FOR_TEST = "Flag for Test";
  const FLAG_FOR_TEST_VALUE = "Metabor";

  function createSourceCollection(): StateCollection {
    const sourceCollection = new StateCollection();

    const stateNew = new State("new");
    stateNew.setMetadataValue("test", true);
    stateNew.setMetadataValue(FLAG_FOR_TEST, FLAG_FOR_TEST_VALUE);
    sourceCollection.addState(stateNew);

    const stateInProcess = new State("in progress");
    sourceCollection.addState(stateInProcess);

    const stateDone = new State("done");
    sourceCollection.addState(stateDone);

    stateNew.addTransition(new Transition(stateInProcess, "start"));
    const fn = vi.fn();
    const observer = new CallbackObserver(fn);
    const event = stateNew.getEvent("start");
    event.attach(observer);
    event.setMetadataValue("event flag", "has command");
    event.setMetadataValue(FLAG_FOR_TEST, FLAG_FOR_TEST_VALUE);

    stateInProcess.addTransition(
      new Transition(stateDone, null, new Tautology("is finished")),
    );

    return sourceCollection;
  }

  it("should create all states from source at target collection", () => {
    const targetCollection = new StateCollection();
    const merger = new StateCollectionMerger(targetCollection);
    const sourceCollection = createSourceCollection();

    expect(targetCollection.hasState("new")).toBe(false);
    expect(targetCollection.hasState("in progress")).toBe(false);
    expect(targetCollection.hasState("done")).toBe(false);

    merger.merge(sourceCollection);

    expect(targetCollection.hasState("new")).toBe(true);
    expect(targetCollection.hasState("in progress")).toBe(true);
    expect(targetCollection.hasState("done")).toBe(true);
  });

  it("should create states that are equal but not the same instance", () => {
    const targetCollection = new StateCollection();
    const merger = new StateCollectionMerger(targetCollection);
    const sourceCollection = createSourceCollection();
    merger.merge(sourceCollection);

    for (const sourceState of sourceCollection.getStates()) {
      const targetState = targetCollection.getState(sourceState.getName());

      // Not the same object
      expect(targetState).not.toBe(sourceState);

      // Same number of transitions
      const sourceTransitions = Array.from(sourceState.getTransitions());
      const targetTransitions = Array.from(targetState.getTransitions());
      expect(targetTransitions).toHaveLength(sourceTransitions.length);

      // Same event names
      expect(targetState.getEventNames()).toEqual(sourceState.getEventNames());

      // Events are copied but not same object
      for (const eventName of sourceState.getEventNames()) {
        expect(targetState.hasEvent(eventName)).toBe(true);
        const sourceEvent = sourceState.getEvent(eventName);
        const targetEvent = targetState.getEvent(eventName);
        expect(targetEvent).not.toBe(sourceEvent);
        expect(targetEvent.getMetadata()).toEqual(sourceEvent.getMetadata());
      }

      // Metadata is the same
      expect(targetState.getMetadata()).toEqual(sourceState.getMetadata());
    }
  });

  it("should copy all flags (metadata on states and events)", () => {
    const targetCollection = new StateCollection();
    const merger = new StateCollectionMerger(targetCollection);
    const sourceCollection = createSourceCollection();
    merger.merge(sourceCollection);

    const state = targetCollection.getState("new");
    expect(state.hasMetadataValue(FLAG_FOR_TEST)).toBe(true);
    expect(state.getMetadataValue(FLAG_FOR_TEST)).toBe(FLAG_FOR_TEST_VALUE);

    const event = state.getEvent("start");
    expect(event.hasMetadataValue(FLAG_FOR_TEST)).toBe(true);
    expect(event.getMetadataValue(FLAG_FOR_TEST)).toBe(FLAG_FOR_TEST_VALUE);
  });

  it("should merge custom TransitionInterface implementations with conditions", () => {
    const condition = new CallbackCondition("isReady", () => true);

    // Custom TransitionInterface — not the concrete Transition class
    class CustomTransition implements TransitionInterface {
      constructor(
        private target: StateInterface,
        private event: string | null,
        private cond: ConditionInterface | null,
      ) {}
      getTargetState(): StateInterface {
        return this.target;
      }
      getEventName(): string | null {
        return this.event;
      }
      getConditionName(): string | null {
        return this.cond?.getName() ?? null;
      }
      getCondition(): ConditionInterface | null {
        return this.cond;
      }
      async isActive(
        _subject: unknown,
        _context: Map<string, unknown>,
        _event?: EventInterface,
      ): Promise<boolean> {
        return true;
      }
      getWeight(): number {
        return 1;
      }
      setWeight(_weight: number): void {}
    }

    const sourceCollection = new StateCollection();
    const s1 = new State("s1");
    const s2 = new State("s2");
    s1.addTransition(new CustomTransition(s2, "go", condition));
    sourceCollection.addState(s1);
    sourceCollection.addState(s2);

    const targetCollection = new StateCollection();
    const merger = new StateCollectionMerger(targetCollection);
    merger.merge(sourceCollection);

    expect(targetCollection.hasState("s1")).toBe(true);
    expect(targetCollection.hasState("s2")).toBe(true);
    const targetTransitions = Array.from(
      targetCollection.getState("s1").getTransitions(),
    );
    expect(targetTransitions).toHaveLength(1);
    expect(targetTransitions[0].getConditionName()).toBe("isReady");
  });
});
