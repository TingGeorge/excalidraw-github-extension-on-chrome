import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "release/",
      "node_modules/",
      "test-results/",
      "test-results-*/",
      "playwright-report/",
      ".build-*/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}", "test/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Playwright fixtures call `use()`, which the hooks rule mistakes for React's.
    files: ["test/e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
);
