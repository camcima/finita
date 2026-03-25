// MaybePromise type
export type { MaybePromise } from "./MaybePromise.js";

// Core classes
export { Event } from "./Event.js";
export { State } from "./State.js";
export { Transition } from "./Transition.js";
export { StateCollection } from "./StateCollection.js";
export { Process } from "./Process.js";
export { Statemachine } from "./Statemachine.js";
export { Dispatcher } from "./Dispatcher.js";

// Interfaces
export type {
  Named,
  Metadata,
  Weighted,
  Observer,
  ObservableSubject,
  ConditionInterface,
  EventInterface,
  TransitionInterface,
  StateInterface,
  StateCollectionInterface,
  ProcessInterface,
  StatemachineInterface,
  MutexInterface,
  MutexFactoryInterface,
  LockAdapterInterface,
  TransitionSelectorInterface,
  ProcessDetectorInterface,
  StateNameDetectorInterface,
  FactoryInterface,
  StatefulInterface,
  LastStateHasChangedDateInterface,
  DispatcherInterface,
  CallbackInterface,
  LoggerInterface,
} from "./interfaces/index.js";

// Conditions
export {
  Tautology,
  Contradiction,
  CallbackCondition,
  Timeout,
  AndComposite,
  OrComposite,
  Not,
} from "./condition/index.js";
export type { ConditionCallbackFn } from "./condition/index.js";

// Observers
export {
  CallbackObserver,
  StatefulStatusChanger,
  OnEnterObserver,
  TransitionLogger,
} from "./observer/index.js";

// Filters
export {
  ActiveTransitionFilter,
  FilterStateByEvent,
  FilterStateByTransition,
  FilterStateByFinalState,
  FilterTransitionByEvent,
} from "./filter/index.js";

// Selectors
export {
  OneOrNoneActiveTransition,
  ScoreTransition,
  WeightTransition,
} from "./selector/index.js";

// Mutex
export { NullMutex, LockAdapterMutex, MutexFactory } from "./mutex/index.js";
export type { StringConverter } from "./mutex/index.js";

// Factory
export {
  Factory,
  SingleProcessDetector,
  AbstractNamedProcessDetector,
  StatefulStateNameDetector,
} from "./factory/index.js";

// Utils
export { SetupHelper, StateCollectionMerger } from "./util/index.js";

// Graph
export { GraphBuilder } from "./graph/index.js";
export type {
  Graph,
  GraphNode,
  GraphEdge,
  DotOptions,
  MermaidOptions,
} from "./graph/index.js";

// Errors
export {
  WrongEventForStateError,
  LockCanNotBeAcquiredError,
  DuplicateStateError,
} from "./error/index.js";
