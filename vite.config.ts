import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    plugins: ["typescript"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["**/tests/**/*.test.ts"],
        plugins: ["vitest"],
        rules: {
          "vitest/no-disabled-tests": "off",
          "vitest/no-focused-tests": "error",
        },
      },
    ],
  },
  run: {
    cache: true,
  },
});
