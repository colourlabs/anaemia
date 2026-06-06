export default {
  workspaces: {
    "packages/bundler": {
      project: ["src/**/*.ts"],
      ignore: ["src/router/scan.ts"],
    },
    "packages/cli": {
      project: ["src/**/*.ts"],
    },
    "packages/core": {
      entry: ["src/runtime/entry-client.tsx", "src/runtime/entry-server.tsx", "src/runtime/context.browser.ts"],
      project: ["src/**/*.ts", "src/**/*.tsx"],
      ignore: ["src/runtime/entry-client.tsx", "src/runtime/entry-server.tsx"],
    },
  },
  ignore: ["templates/**"],
  ignoreUnresolved: [],
  ignoreDependencies: ["@rspack/core", "@typescript-eslint/eslint-plugin", "@typescript-eslint/parser"],
};
