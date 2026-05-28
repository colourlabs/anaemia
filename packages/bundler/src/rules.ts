import { createRequire } from "node:module";
import path from "node:path";
import type { AnaemiaConfig } from "@anaemia/core";

const require = createRequire(import.meta.url);

export function createStyleRules(config: AnaemiaConfig) {
  const useSass = config.styles?.sass !== false;
  const useModules = config.styles?.modules ?? true;

  const baseLoaders = useSass ? [{ loader: require.resolve("sass-loader"), options: { api: "modern" } }] : [];

  return {
    client: {
      test: /\.(c|sc|sa)ss$/,
      type: useModules ? "css/auto" : ("css" as const),
      use: baseLoaders,
    },
    server: {
      test: /\.(c|sc|sa)ss$/,
      type: useModules ? "css/auto" : ("css" as const),
      generator: {
        css: {
          exportOnlyLocals: true,
        },
      },
      use: baseLoaders,
    },
  };
}

export function createBabelRule({
  isServer,
  isDev,
  plugins = [],
}: {
  isServer: boolean;
  isDev: boolean;
  plugins: any[];
}) {
  const generateMode = isServer ? "ssr" : "dom";

  return {
    test: /\.[jt]sx?$/,
    use: [
      {
        loader: require.resolve("babel-loader"),
        options: {
          presets: [
            [require.resolve("babel-preset-solid"), { generate: generateMode, hydratable: true, dev: isDev }],
            require.resolve("@babel/preset-typescript"),
          ],
          plugins: plugins,
        },
      },
    ],
  };
}