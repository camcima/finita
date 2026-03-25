import type {
  DispatcherInterface,
  CallbackInterface,
} from "./interfaces/DispatcherInterface.js";
import type { EventInterface } from "./interfaces/EventInterface.js";

export class Dispatcher implements DispatcherInterface {
  private commands: Array<{ event: EventInterface; args: unknown[] }> = [];
  private onReadyCallbacks: CallbackInterface[] = [];
  private ready = false;

  dispatch(
    event: EventInterface,
    args: unknown[] = [],
    onReadyCallback?: CallbackInterface,
  ): void {
    if (this.ready) {
      throw new Error("Was already invoked!");
    }
    this.commands.push({ event, args });
    if (onReadyCallback) {
      this.onReadyCallbacks.push(onReadyCallback);
    }
  }

  async invoke(): Promise<void> {
    if (this.ready) {
      throw new Error("Was already invoked!");
    }
    for (const { event, args } of this.commands) {
      await event.invoke(...args);
    }
    this.ready = true;
    for (const callback of this.onReadyCallbacks) {
      await callback.invoke();
    }
  }

  isReady(): boolean {
    return this.ready;
  }
}
