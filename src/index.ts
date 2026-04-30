// MaybePromise type
export type { MaybePromise } from "./MaybePromise.js";

// Core classes
export { Event } from "./Event.js";
export { Process } from "./Process.js";
export { State } from "./State.js"; // exported for type / instanceof use only
export { Transition } from "./Transition.js"; // same
export { ProcessBuilder } from "./ProcessBuilder.js";
export type {
  AddStateOptions,
  AddTransitionOptions,
  BuildOptions,
} from "./ProcessBuilder.js";
export { Statemachine } from "./Statemachine.js";

// Interfaces
export type {
  Named,
  Metadata,
  Weighted,
  Observer,
  ObservableSubject,
  AfterTransitionObserver,
  EnqueueContext,
  BeforeTransitionObserver,
  ConditionInterface,
  EventInterface,
  TransitionInterface,
  StateInterface,
  StateCollectionInterface,
  ProcessInterface,
  StatemachineInterface,
  StatemachineOptions,
  MutexInterface,
  MutexFactoryInterface,
  LockAdapterInterface,
  TransitionSelectorInterface,
  TransitionFrame,
  ProposedTransitionFrame,
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
  ProcessFinalizedError,
  GraphValidationError,
  DuplicateTransitionError,
} from "./error/index.js";
export type {
  GraphValidationCode,
  DuplicateTransitionConflict,
} from "./error/index.js";
