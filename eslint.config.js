import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import unicorn from "eslint-plugin-unicorn";

export default [
  {
    // ignore stubs
    ignores: [
      "dist/**",
      "templates/**",
      ".anaemia/**",
      "**/dist/**",
      "scripts/bench/app/**",
      "pnpm-lock.yaml",
      "packages/core/src/context.browser.ts",
    ],
  },

  js.configs.recommended,

  // all TS files across packages
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./packages/*/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "unused-imports": unusedImports,
      unicorn: unicorn,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "unicorn/prefer-node-protocol": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-param-reassign": "error",
      "prefer-const": "error",
      "unicorn/no-array-for-each": "error",
      "unicorn/no-await-expression-member": "error",
      "unicorn/prefer-logical-operator-over-ternary": "error",
      "unicorn/no-useless-undefined": "error",
      "unicorn/prefer-array-flat-map": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },

  // node globals for bundler + cli + scripts
  {
    files: [
      "packages/bundler/**/*.ts",
      "packages/cli/**/*.ts",
      "packages/cli/scripts/**/*.mjs",
      "packages/core/src/plugins/**/*.ts",
      "scripts/**/*.{js,mjs}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // browser + node for core runtime
  {
    files: ["packages/core/src/runtime/**/*.ts", "packages/core/src/runtime/**/*.tsx"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // allow console in certain files
  {
    files: ["packages/cli/**/*.ts", "packages/cli/scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: [
      "packages/core/src/runtime/entry-server.tsx",
      "packages/core/src/runtime/server/**/*.ts",
      "packages/core/src/runtime/server/**/*.tsx",
    ],
    rules: {
      "no-console": "off",
    },
  },

  // test files
  {
    files: ["packages/**/test/**/*.mjs", "packages/**/test/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
