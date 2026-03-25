# Contributing to finita

Thanks for your interest in contributing! This document covers the basics for getting started.

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
git clone https://github.com/camcima/finita.git
cd finita
npm install
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Linting

Runs TypeScript type checking and ESLint:

```bash
npm run lint
```

### Formatting

The project uses [Prettier](https://prettier.io/) with default settings. To format all files:

```bash
npm run format
```

To check formatting without writing changes:

```bash
npm run format:check
```

### Building

```bash
npm run build
```

## Project Structure

```
src/
  index.ts                 # Barrel export
  MaybePromise.ts          # MaybePromise<T> = T | Promise<T> utility type
  Event.ts                 # Event implementation
  State.ts                 # State implementation
  Transition.ts            # Transition implementation
  StateCollection.ts       # Named collection of states
  Process.ts               # Process (workflow definition)
  Statemachine.ts          # Runtime state machine
  Dispatcher.ts            # Deferred event dispatcher
  interfaces/              # All TypeScript interfaces
  condition/               # Condition (guard) implementations
  observer/                # Observer implementations
  filter/                  # State and transition filters
  selector/                # Transition selection strategies
  mutex/                   # Locking implementations
  factory/                 # State machine factory pattern
  util/                    # SetupHelper, StateCollectionMerger
  graph/                   # Graph visualization builder
  error/                   # Custom error classes
tests/                     # Vitest test files
docs/                      # Component documentation
```

## Key Design Principles

- **Async-first**: All conditions, observers, and mutexes use `MaybePromise<T>` return types. Sync implementations work seamlessly -- `boolean` satisfies `MaybePromise<boolean>`.
- **Zero dependencies**: The library has no runtime dependencies. Keep it that way.
- **Port fidelity**: This library is a TypeScript port of [metabor/statemachine](https://github.com/Metabor/Statemachine). Maintain structural alignment with the original PHP library where reasonable.

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass (`npm test`), linting passes (`npm run lint`), and formatting is correct (`npm run format:check`)
4. Add or update tests for any new or changed behavior
5. Update documentation in `docs/` if your change affects the public API
6. Open a pull request

## Writing Tests

Tests use [Vitest](https://vitest.dev/) and live in the `tests/` directory. Each source module has a corresponding test file (e.g., `tests/core.test.ts`, `tests/condition.test.ts`).

When testing async behavior:

```typescript
// Async operations that should succeed
await sm.triggerEvent("approve");
expect(sm.getCurrentState().getName()).toBe("approved");

// Async operations that should throw
await expect(sm.triggerEvent("invalid")).rejects.toThrow(
  WrongEventForStateError,
);
```

## Code Style

- Code is formatted with [Prettier](https://prettier.io/) (default config) and linted with [ESLint](https://eslint.org/) + [typescript-eslint](https://typescript-eslint.io/)
- Use TypeScript strict mode
- Prefer `readonly` for constructor-assigned fields
- Use explicit return types on public methods
- Keep classes focused -- one responsibility per class
- Prefix intentionally unused parameters with `_` (e.g., `_subject`)
- No runtime dependencies

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
