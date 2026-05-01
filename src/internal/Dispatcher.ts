import type { DispatcherInterface } from "../interfaces/DispatcherInterface.js";
import type { EventInterface } from "../interfaces/EventInterface.js";

export class Dispatcher implements DispatcherInterface {
  private commands: Array<{ event: EventInterface; args: unknown[] }> = [];
  private ready = false;

  dispatch(event: EventInterface, args: unknown[] = []): void {
    if (this.ready) {
      throw new Error("Was already invoked!");
    }
    this.commands.push({ event, args });
  }

  async invoke(): Promise<void> {
    if (this.ready) {
      throw new Error("Was already invoked!");
    }
    for (const { event, args } of this.commands) {
      await event.invoke(...args);
    }
    this.ready = true;
  }
}
