import type { EventInterface } from "./interfaces/EventInterface.js";
import type { Observer } from "./interfaces/Observer.js";

export class Event implements EventInterface {
  private readonly name: string;
  private readonly observers: Set<Observer> = new Set();
  private readonly metadata: Map<string, unknown> = new Map();
  private invokeArgs: unknown[] = [];

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getInvokeArgs(): unknown[] {
    return this.invokeArgs;
  }

  async invoke(...args: unknown[]): Promise<void> {
    this.invokeArgs = args;
    try {
      await this.notify();
    } finally {
      this.invokeArgs = [];
    }
  }

  attach(observer: Observer): void {
    this.observers.add(observer);
  }

  detach(observer: Observer): void {
    this.observers.delete(observer);
  }

  async notify(): Promise<void> {
    for (const observer of this.observers) {
      await observer.update(this);
    }
  }

  getObservers(): Iterable<Observer> {
    return this.observers;
  }

  getMetadata(): Record<string, unknown> {
    return Object.fromEntries(this.metadata);
  }

  getMetadataValue(key: string): unknown {
    return this.metadata.get(key);
  }

  setMetadataValue(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  hasMetadataValue(key: string): boolean {
    return this.metadata.has(key);
  }

  deleteMetadataValue(key: string): void {
    this.metadata.delete(key);
  }
}
