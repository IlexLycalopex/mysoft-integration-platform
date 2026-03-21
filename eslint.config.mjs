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
  ]),
  // Project-wide overrides.
  // `no-explicit-any` is demoted to a warning because the codebase uses
  // `(adminClient as any)` as a necessary workaround for the typed Supabase
  // client not covering all tables. Treat as technical debt, not a blocker.
  // `no-require-imports` is off for CJS scripts (Windows Agent helpers etc.).
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
