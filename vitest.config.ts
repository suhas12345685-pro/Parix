// Root-level config: only atrium owns test runs. qa/e2e uses node:test and is
// driven by its own scripts/test-e2e.ts, not vitest — keep it out of any
// accidental `npx vitest` run from the repo root.
//
// vitest is installed only in atrium/node_modules, so this file avoids
// importing from `vitest/config` (which fails to resolve at the repo root).
// A plain object satisfies vitest's config loader.
export default {
  test: {
    include: [
      "atrium/src/**/*.{test,spec}.ts",
      "atrium/tests/**/*.{test,spec}.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "qa/**"],
  },
};
