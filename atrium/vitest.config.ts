import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.{test,spec}.ts",
      "tests/**/*.{test,spec}.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "../qa/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
