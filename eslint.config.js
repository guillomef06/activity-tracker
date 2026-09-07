// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");
const prettierConfig = require("eslint-config-prettier");
const sonarjs = require("eslint-plugin-sonarjs");

// Recommended sonarjs rules are all "error" by default, which would fail the
// build on the 60+ pre-existing findings. Downgrade to "warn" so issues are
// surfaced without blocking CI; tighten per-rule to "error" as they get fixed.
const sonarjsWarnRules = Object.fromEntries(
  Object.entries(sonarjs.configs.recommended.rules ?? {}).map(([rule, severity]) => [
    rule,
    severity === "error" ? "warn" : severity,
  ]),
);

module.exports = defineConfig([
  {
    files: ["src/**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      sonarjs.configs.recommended,
      prettierConfig,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      ...sonarjsWarnRules,
    },
  },
  {
    // Test fixtures legitimately use literal password strings (form validation,
    // auth flows) — these aren't real credentials, so the hardcoded-secret check
    // is a false positive here.
    files: ["src/**/*.spec.ts"],
    rules: {
      "sonarjs/no-hardcoded-passwords": "off",
    },
  },
  {
    files: ["src/**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
      prettierConfig,
    ],
    rules: {},
  },
]);
