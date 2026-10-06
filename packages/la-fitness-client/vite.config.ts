import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    dts: {
      generator: "tsgo",
    },
    exports: {
      // Adds a custom export condition pointing at `src/`. Workspace consumers
      // (apps/e2e) opt into it via tsconfig `customConditions` so type-checking
      // works without building first; runtime resolution still uses dist/.
      devExports: "la-fitness-client-source",
    },
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
