import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    // ingore stubs
    ignores: ["dist/**", ".anaemia/**", "**/dist/**", "pnpm-lock.yaml", "packages/core/src/context.browser.ts"],
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
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
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

  // node globals for bundler + cli
  {
    files: ["packages/bundler/**/*.ts", "packages/cli/**/*.ts", "packages/core/src/plugins/**/*.ts"],
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
