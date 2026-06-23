import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts is re-exports only; interfaces/** and MaybePromise.ts are
      // type-only files with no runtime code to measure.
      exclude: ["src/index.ts", "src/interfaces/**", "src/MaybePromise.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
