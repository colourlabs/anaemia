import js from "@eslint/js";
import globals from "globals";
import fs from "node:fs";
import path from "node:path";

const isTypeScript = fs.existsSync(path.resolve(process.cwd(), "tsconfig.json"));

const tsRules = isTypeScript ? await import("@typescript-eslint/eslint-plugin").then(m => m.default) : null;
const tsParser = isTypeScript ? await import("@typescript-eslint/parser").then(m => m.default) : null;

export default [
  js.configs.recommended,
  {
    ignores: ["dist/**", ".anaemia/**"],
  },
  
  {
    languageOptions: {
      ecmaVersion: 2026,
      sourceType: "module",
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "no-undef": "off",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
    },
  },

  // typescript rules - only when tsconfig present
  ...(isTypeScript && tsRules && tsParser ? [{
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: { "@typescript-eslint": tsRules },
    rules: {
      ...tsRules.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }] : []),

  // feature + shared components
  {
    files: ["**/src/features/**/*.tsx", "**/src/shared/components/**/*.tsx"],
    languageOptions: {
      globals: {
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-undef": isTypeScript ? "off" : "error",
    },
  },

  // browser entry points
  {
    files: ["**/src/core/services/**/*.ts", "**/src/runtime/entry-client.tsx"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // routes + config - node globals
  {
    files: [
      "**/src/routes/**/*.ts",
      "**/src/routes/**/*.tsx",
      "**/src/routes/**/*.js",
      "**/*.config.ts",
      "eslint.config.js",
    ],
    languageOptions: {
      globals: { ...globals.node, process: "readonly" },
    },
  },
];