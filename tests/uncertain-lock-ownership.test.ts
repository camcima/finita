import { describe, it, expect } from "vitest";
import {
  ProcessBuilder,
  Statemachine,
  LockAdapterMutex,
  LockOwnershipUncertainError,
  LockCanNotBeReleasedError,
  FinitaError,
} from "../src/index.js";
import type {
  EnqueueContext,
  LockAdapterInterface,
  TransitionFrame,
} from "../src/index.js";

/**
 * After a failed release the machine cannot tell whether it still holds the
 * lock: the unlock may have happened remotely with its reply lost, or never
 * happened at all. Queued and later operations used to see isAcquired() ===
 * true, skip acquisition, and run under a lock another machine may now own.
 * They must be rejected until ownership is re-established.
 */
class LockService {
  owner: string | null = null;
}

interface Faults {
  /** Unlock happens remotely, then the reply is lost (adapter throws). */
  lostReply?: number;
  /** Adapter throws before the unlock reaches the service. */
  failBeforeUnlock?: number;
}

const adapter = (
  service: LockService,
  token: string,
  faults: Faults = {},
): LockAdapterInterface & { acquires: number } => ({
  acquires: 0,
  async acquireLock() {
    this.acquires++;
    if (service.owner !== null) return false;
    service.owner = token;
    return true;
  },
  async releaseLock() {
    if (faults.failBeforeUnlock) {
      faults.failBeforeUnlock--;
      throw new Error("connection reset");
    }
    const released = service.owner === token;
    if (released) service.owner = null;
    if (faults.lostReply) {
      faults.lostReply--;
      throw new Error("reply lost");
    }
    return released;
  },
  async isLocked() {
    return service.owner !== null;
  },
});

const build = () =>
  new ProcessBuilder("p")
    .addState("a", { initial: true })
    .addState("b")
    .addState("c")
    .addTransition("a", "b", { event: "go" })
    .addTransition("b", "c", { event: "next" })
    .build();

const machine = (lock: LockAdapterInterface, autoreleaseLock = true) => {
  const sm = new Statemachine({}, build(), {
    mutex: new LockAdapterMutex(lock, "resource"),
    autoreleaseLock,
  });
  const notified: string[] = [];
  sm.attachBefore({
    notify: (frame: TransitionFrame) => {
      notified.push(frame.toState.getName());
    },
  });
  return { sm, notified };
};

describe("uncertain lock ownership after a failed release", () => {
  it("rejects an already-queued operation when the unlock reply was lost", async () => {
    const service = new LockService();
    const lockA = adapter(service, "owner-a", { lostReply: 1 });
    const { sm, notified } = machine(lockA);

    const first = sm.triggerEvent("go");
    const second = sm.triggerEvent("next");

    await expect(first).rejects.toThrowError("reply lost");
    // Another worker takes the lock the service now considers free.
    service.owner = "owner-b";
    await expect(second).rejects.toBeInstanceOf(LockOwnershipUncertainError);

    expect(sm.getCurrentState().getName()).toBe("b");
    expect(notified).toEqual(["b"]);
    expect(service.owner).toBe("owner-b");
  });

  it("rejects later operations when the unlock never happened", async () => {
    const service = new LockService();
    const { sm, notified } = machine(
      adapter(service, "owner-a", { failBeforeUnlock: 1 }),
    );

    await expect(sm.triggerEvent("go")).rejects.toThrowError(
      "connection reset",
    );
    await expect(sm.triggerEvent("next")).rejects.toBeInstanceOf(
      LockOwnershipUncertainError,
    );
    await expect(sm.checkTransitions()).rejects.toBeInstanceOf(
      LockOwnershipUncertainError,
    );
    expect(notified).toEqual(["b"]);
  });

  it("treats a release that returns false the same way", async () => {
    const service = new LockService();
    const lock = adapter(service, "owner-a");
    const { sm } = machine(lock);
    await sm.triggerEvent("go");
    // Something else stole the lock while we held it: our release removes
    // nothing and returns false.
    await sm.acquireLock();
    service.owner = "owner-b";
    await sm.releaseLock();
    await expect(sm.triggerEvent("next")).rejects.toBeInstanceOf(
      LockOwnershipUncertainError,
    );
  });

  it("rejects chained operations through onChainedOperationError", async () => {
    const service = new LockService();
    const chained: unknown[] = [];
    const sm = new Statemachine({}, build(), {
      mutex: new LockAdapterMutex(
        adapter(service, "owner-a", { lostReply: 1 }),
        "resource",
      ),
      onChainedOperationError: (err) => chained.push(err),
    });
    sm.attachAfter({
      notify(frame: TransitionFrame, ctx: EnqueueContext): void {
        if (frame.toState.getName() === "b") ctx.enqueue("next");
      },
    });

    await expect(sm.triggerEvent("go")).rejects.toThrowError("reply lost");
    await sm.whenIdle();
    expect(chained).toHaveLength(1);
    expect(chained[0]).toBeInstanceOf(LockOwnershipUncertainError);
    expect(sm.getCurrentState().getName()).toBe("b");
  });

  it("exposes the release failure as the cause, with a stable code", async () => {
    const { sm } = machine(
      adapter(new LockService(), "owner-a", { failBeforeUnlock: 1 }),
    );
    await sm.triggerEvent("go").catch(() => undefined);
    const err = await sm.triggerEvent("next").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(FinitaError);
    expect((err as LockOwnershipUncertainError).code).toBe(
      "lockOwnershipUncertain",
    );
    expect((err as LockOwnershipUncertainError).cause).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toBe("connection reset");
  });

  it("resumes after a successful manual releaseLock()", async () => {
    const service = new LockService();
    const lock = adapter(service, "owner-a", { failBeforeUnlock: 1 });
    const { sm, notified } = machine(lock);

    await sm.triggerEvent("go").catch(() => undefined);
    // The unlock never reached the service, so a retry genuinely frees it.
    await sm.releaseLock();
    expect(sm.isLockAcquired()).toBe(false);

    await sm.triggerEvent("next");
    expect(sm.getCurrentState().getName()).toBe("c");
    expect(notified).toEqual(["b", "c"]);
    expect(lock.acquires).toBe(2);
    expect(service.owner).toBeNull();
  });

  it("stays blocked when the manual retry cannot confirm the release", async () => {
    const service = new LockService();
    const { sm } = machine(adapter(service, "owner-a", { lostReply: 1 }));

    await sm.triggerEvent("go").catch(() => undefined);
    service.owner = "owner-b";
    // The first unlock already happened, so this one removes nothing.
    await sm.releaseLock();
    await expect(sm.triggerEvent("next")).rejects.toBeInstanceOf(
      LockOwnershipUncertainError,
    );
  });

  it("marks ownership uncertain after a failed manual release", async () => {
    const service = new LockService();
    const { sm } = machine(
      adapter(service, "owner-a", { failBeforeUnlock: 1 }),
      false,
    );
    await sm.acquireLock();
    await sm.triggerEvent("go");
    await sm.releaseLock();
    await expect(sm.triggerEvent("next")).rejects.toBeInstanceOf(
      LockOwnershipUncertainError,
    );
  });

  it("ignores a defensive manual release of a lock the machine does not hold", async () => {
    const released: unknown[] = [];
    const sm = new Statemachine({}, build(), {
      mutex: new LockAdapterMutex(
        adapter(new LockService(), "owner-a"),
        "resource",
      ),
      onReleaseError: (err) => released.push(err),
    });
    await sm.triggerEvent("go");
    await sm.releaseLock();
    // The existing report still happens, but the machine is not blocked.
    expect(released[0]).toBeInstanceOf(LockCanNotBeReleasedError);
    await sm.triggerEvent("next");
    expect(sm.getCurrentState().getName()).toBe("c");
  });
});
