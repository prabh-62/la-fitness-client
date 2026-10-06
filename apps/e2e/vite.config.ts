import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live tests hit the real API, which is slow (~10-40s per call).
    testTimeout: 120_000,
    // Expose LAF_* from .env / .env.local to tests (shell env still wins).
    env: loadEnv(mode, process.cwd(), "LAF_"),
  },
  run: {
    tasks: {
      // These tests consume `la-fitness-client` through its published `exports`
      // (i.e. dist/), so the library must be packed first.
      test: {
        command: "vp test",
        dependsOn: [{ task: "build", from: "dependencies" }],
        // Live tests depend on network + credentials; never replay from cache.
        cache: false,
      },
      "example:checkins": {
        command: "node --env-file-if-exists=.env examples/checkins.ts",
        dependsOn: [{ task: "build", from: "dependencies" }],
        cache: false,
      },
    },
  },
}));
