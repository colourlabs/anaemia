import js from "@eslint/js";
import globals from "globals";
import boundaries from "eslint-plugin-boundaries";

export interface AnaemiaEslintOptions {
  typescript?: boolean;
}

export async function anaemia(options: AnaemiaEslintOptions = {}): Promise<object[]> {
  const { typescript = true } = options;

  const tsRules = typescript ? await import("@typescript-eslint/eslint-plugin").then((m) => m.default) : null;
  const tsParser = typescript ? await import("@typescript-eslint/parser").then((m) => m.default) : null;

  return [
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
        eqeqeq: ["error", "always"],
      },
    },

    // typescript
    ...(typescript && tsRules && tsParser
      ? [
          {
            files: ["**/*.ts", "**/*.tsx"],
            languageOptions: {
              parser: tsParser,
              parserOptions: {
                projectService: { defaultProject: "./tsconfig.json" },
              },
            },
            plugins: { "@typescript-eslint": tsRules },
            rules: {
              ...tsRules.configs.recommended.rules,
              "@typescript-eslint/no-explicit-any": "warn",
              "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            },
          },
        ]
      : []),

    // layer boundaries
    {
      plugins: { boundaries },
      settings: {
        "boundaries/elements": [
          { type: "app", pattern: "src/app/*" },
          { type: "routes", pattern: "src/routes/*" },
          { type: "features", pattern: "src/features/*" },
          { type: "entities", pattern: "src/entities/*" },
          { type: "shared", pattern: "src/shared/*" },
        ],
      },
      rules: {
        "boundaries/element-types": [
          "error",
          {
            default: "disallow",
            rules: [
              { from: "app", allow: ["routes", "features", "entities", "shared"] },
              { from: "routes", allow: ["features", "entities", "shared"] },
              { from: "features", allow: ["entities", "shared"] },
              { from: "entities", allow: ["shared"] },
              { from: "shared", allow: [] },
            ],
          },
        ],
      },
    },

    // browser context
    {
      files: [
        "**/src/**/*.tsx",
        "**/src/shared/**/*.ts",
        "**/src/entities/**/*.ts",
        "**/src/features/**/*.ts",
        "**/src/app/providers/**/*.ts",
      ],
      languageOptions: {
        globals: { ...globals.browser },
      },
    },

    // server context
    {
      files: [
        "**/*.server.ts",
        "**/src/routes/**/*.ts",
        "**/src/routes/**/*.tsx",
        "**/*.config.ts",
        "eslint.config.js",
      ],
      languageOptions: {
        globals: { ...globals.node, process: "readonly" },
      },
    },
  ];
}
