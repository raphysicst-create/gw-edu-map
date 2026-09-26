import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test-run output, not source:
    "playwright-report/**",
    "test-results/**",
    // Downloaded source material, local research helpers, and generated intermediates.
    "data/raw/**",
    "data/interim/**",
    // Sibling agents' git worktrees (e.g. .claude/worktrees/<id>/.next/types/**)
    // live physically under this checkout but are their own independent trees;
    // linting them here is both wrong (not this repo's source) and unstable
    // (they come and go as other agents work).
    ".claude/**",
  ]),
]);

export default eslintConfig;
