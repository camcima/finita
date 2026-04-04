# Interfaces

All TypeScript interfaces exported by the library. These can be used to create custom implementations of any component.

**Import:** `import type { InterfaceName } from '@camcima/finita'`

```mermaid
classDiagram
    direction TB

    Named <|-- EventInterface
    Named <|-- ConditionInterface
    Named <|-- ProcessInterface
    Metadata <|-- EventInterface
    Metadata <|-- StateInterface
    Weighted <|-- TransitionInterface
    ObservableSubject <|-- EventInterface
    ObservableSubject <|-- StatemachineInterface

    StateCollectionInterface <|-- ProcessInterface

    StateInterface --> TransitionInterface : getTransitions
    StateInterface --> EventInterface : getEvent
    TransitionInterface --> StateInterface : getTargetState
    StatemachineInterface --> ProcessInterface : getProcess
    StatemachineInterface --> StateInterface : getCurrentState

    FactoryInterface --> StatemachineInterface : creates
    FactoryInterface --> ProcessDetectorInterface : uses
    FactoryInterface --> MutexFactoryInterface : uses
    MutexFactoryInterface --> MutexInterface : creates
```

## Table of Contents

- [MaybePromise Type](#maybepromise-type)
- [Base Interfaces](#base-interfaces)
- [Core Interfaces](#core-interfaces)
- [Observer Interfaces](#observer-interfaces)
- [Condition Interface](#condition-interface)
- [Factory Interfaces](#factory-interfaces)
- [Mutex Interfaces](#mutex-interfaces)
- [Dispatcher Interfaces](#dispatcher-interfaces)
- [Utility Interfaces](#utility-interfaces)

---

## MaybePromise Type

A utility type used throughout the library to indicate that a method may return either a synchronous value or a `Promise`.

```typescript
type MaybePromise<T> = T | Promise<T>;
```

Methods that return `MaybePromise<T>` can be implemented synchronously (returning `T` directly) or asynchronously (returning `Promise<T>`). The library handles both cases internally.

---

## Base Interfaces

### Named

An object with a name.

```typescript
interface Named {
  getName(): string;
}
```

Used by: `StateInterface`, `EventInterface`, `ConditionInterface`, `ProcessInterface`

### Metadata

An object with key-value metadata.

```typescript
interface Metadata {
  getMetadata(): Record<string, unknown>;
}
```

Used by: `StateInterface`, `EventInterface`

### Weighted

An object with a numeric weight.

```typescript
interface Weighted {
  getWeight(): number;
}
```

Used by: `TransitionInterface`

---

## Core Interfaces

### EventInterface

```typescript
interface EventInterface extends Named, Metadata, ObservableSubject {
  getInvokeArgs(): unknown[];
  invoke(...args: unknown[]): Promise<void>;
  getMetadataValue(key: string): unknown;
  setMetadataValue(key: string, value: unknown): void;
  hasMetadataValue(key: string): boolean;
  deleteMetadataValue(key: string): void;
}
```

### StateInterface

```typescript
interface StateInterface extends Named, Metadata {
  getTransitions(): Iterable<TransitionInterface>;
  addTransition(transition: TransitionInterface): void;
  getEventNames(): string[];
  hasEvent(name: string): boolean;
  getEvent(name: string): EventInterface;
  getMetadataValue(key: string): unknown;
  setMetadataValue(key: string, value: unknown): void;
  hasMetadataValue(key: string): boolean;
  deleteMetadataValue(key: string): void;
}
```

### TransitionInterface

```typescript
interface TransitionInterface<TSubject = unknown> extends Weighted {
  getTargetState(): StateInterface;
  getEventName(): string | null;
  getConditionName(): string | null;
  getCondition(): ConditionInterface<TSubject> | null;
  isActive(
    subject: TSubject,
    context: Map<string, unknown>,
    event?: EventInterface,
  ): Promise<boolean>;
}
```

### StateCollectionInterface

A read-only interface for accessing states in a collection.

```typescript
interface StateCollectionInterface {
  getStates(): Iterable<StateInterface>;
  getState(name: string): StateInterface;
  hasState(name: string): boolean;
}
```

Mutation methods (`addState`, `merge`) are available only on the concrete `StateCollection` class.

### ProcessInterface

```typescript
interface ProcessInterface extends Named, StateCollectionInterface {
  getInitialState(): StateInterface;
}
```

Note: `ProcessInterface` extends both `Named` and `StateCollectionInterface`. A `Process` is immutable after construction -- all states are discovered automatically from the initial state's transition graph.

### StatemachineInterface

```typescript
interface StatemachineInterface<TSubject = unknown> extends ObservableSubject {
  getCurrentState(): StateInterface;
  getSubject(): TSubject;
  getProcess(): ProcessInterface;
  triggerEvent(name: string, context?: Map<string, unknown>): Promise<void>;
  checkTransitions(context?: Map<string, unknown>): Promise<void>;
  getSelectedTransition(): TransitionInterface<TSubject> | null;
  getLastState(): StateInterface | null;
  getCurrentContext(): Map<string, unknown> | null;
  acquireLock(): Promise<boolean>;
  releaseLock(): Promise<void>;
  isLockAcquired(): boolean;
  isAutoreleaseLock(): boolean;
  setAutoreleaseLock(autorelease: boolean): void;
}
```

---

## Observer Interfaces

### Observer

```typescript
interface Observer {
  update(subject: ObservableSubject): MaybePromise<void>;
}
```

### ObservableSubject

```typescript
interface ObservableSubject {
  attach(observer: Observer): void;
  detach(observer: Observer): void;
  notify(): Promise<void>;
  getObservers(): Iterable<Observer>;
}
```

---

## Condition Interface

### ConditionInterface

```typescript
interface ConditionInterface<TSubject = unknown> extends Named {
  checkCondition(
    subject: TSubject,
    context: Map<string, unknown>,
  ): MaybePromise<boolean>;
}
```

---

## Factory Interfaces

### FactoryInterface

```typescript
interface FactoryInterface<TSubject = unknown> {
  createStatemachine(
    subject: TSubject,
  ): Promise<StatemachineInterface<TSubject>>;
  setMutexFactory(factory: MutexFactoryInterface<TSubject> | null): void;
  setTransitionSelector(selector: TransitionSelectorInterface<TSubject>): void;
  attachStatemachineObserver(observer: Observer): void;
  detachStatemachineObserver(observer: Observer): void;
  getStatemachineObservers(): Iterable<Observer>;
}
```

### ProcessDetectorInterface

```typescript
interface ProcessDetectorInterface<TSubject = unknown> {
  detectProcess(subject: TSubject): ProcessInterface;
}
```

### StateNameDetectorInterface

```typescript
interface StateNameDetectorInterface<TSubject = unknown> {
  detectCurrentStateName(subject: TSubject): string | null;
}
```

### TransitionSelectorInterface

```typescript
interface TransitionSelectorInterface<TSubject = unknown> {
  selectTransition(
    transitions: Iterable<TransitionInterface<TSubject>>,
  ): TransitionInterface<TSubject> | null;
}
```

### StatefulInterface

Implemented by subjects that persist their current state name.

```typescript
interface StatefulInterface {
  getCurrentStateName(): string;
  setCurrentStateName(name: string): void;
}
```

### LastStateHasChangedDateInterface

Implemented by subjects that track when their state last changed. Required by the `Timeout` condition.

```typescript
interface LastStateHasChangedDateInterface {
  getLastStateHasChangedDate(): Date;
}
```

---

## Mutex Interfaces

### MutexInterface

```typescript
interface MutexInterface {
  acquireLock(): MaybePromise<boolean>;
  releaseLock(): MaybePromise<boolean>;
  isAcquired(): boolean;
  isLocked(): MaybePromise<boolean>;
}
```

### MutexFactoryInterface

```typescript
interface MutexFactoryInterface<TSubject = unknown> {
  createMutex(subject: TSubject): MaybePromise<MutexInterface>;
}
```

### LockAdapterInterface

```typescript
interface LockAdapterInterface {
  acquireLock(resourceName: string): MaybePromise<boolean>;
  releaseLock(resourceName: string): MaybePromise<boolean>;
  isLocked(resourceName: string): MaybePromise<boolean>;
}
```

---

## Dispatcher Interfaces

### CallbackInterface

```typescript
interface CallbackInterface {
  invoke(): MaybePromise<void>;
}
```

### DispatcherInterface

```typescript
interface DispatcherInterface extends CallbackInterface {
  dispatch(
    event: EventInterface,
    args?: unknown[],
    onReadyCallback?: CallbackInterface,
  ): void;
  isReady(): boolean;
  invoke(): Promise<void>;
}
```

---

## Utility Interfaces

### LoggerInterface

Compatible with common logging libraries (e.g., pino, winston).

```typescript
interface LoggerInterface {
  log(level: string, message: string, context?: Record<string, unknown>): void;
}
```
