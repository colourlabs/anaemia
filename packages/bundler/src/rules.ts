import { createRequire } from "node:module";
import type { AnaemiaConfig } from "@anaemia/core";
import type { PluginItem } from "@babel/core";
import type { RuleSetRule } from "@rspack/core";

const require = createRequire(import.meta.url);

export function createStyleRules(config: AnaemiaConfig) {
  const useSass = config.styles?.sass !== false;
  const useModules = config.styles?.modules ?? true;
  const baseLoaders = useSass ? [{ loader: require.resolve("sass-loader"), options: { api: "modern" } }] : [];
  const localIdentName = config.styles?.modulesLocalIdentName ?? "[name]__[local]__[hash:base64:5]";
  const cssParser = useModules ? { cssModules: { localIdentName } } : undefined;

  return {
    client: {
      test: /\.(c|sc|sa)ss$/,
      type: useModules ? "css/auto" : ("css" as const),
      use: baseLoaders,
      parser: cssParser,
    },
    server: {
      test: /\.(c|sc|sa)ss$/,
      type: useModules ? "css/auto" : ("css" as const),
      generator: { css: { exportOnlyLocals: true } },
      use: baseLoaders,
      parser: cssParser,
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
  plugins?: PluginItem[];
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

export function createAssetRules(isDev: boolean) {
  const filename = isDev ? "assets/[name][ext]" : "assets/[name].[contenthash:8][ext]";

  const sharedRawRule: RuleSetRule = {
    test: /\.(png|jpe?g|gif|webp|avif|ico|svg|json)$/i,
    resourceQuery: /raw/,
    type: "asset/source",
  };

  const sharedUrlRule: RuleSetRule = {
    test: /\.(png|jpe?g|gif|webp|avif|ico|svg)$/i,
    resourceQuery: /url/,
    type: "asset/resource",
    generator: { filename },
  };

  const sharedInlineRule: RuleSetRule = {
    test: /\.(png|jpe?g|gif|webp|avif|ico|svg)$/i,
    resourceQuery: /inline/,
    type: "asset/inline",
  };

  const sharedAssetRules: RuleSetRule[] = [sharedRawRule, sharedUrlRule, sharedInlineRule];

  const clientRules: RuleSetRule[] = [
    ...sharedAssetRules,
    { test: /\.(png|jpe?g|gif|webp|avif|ico)$/i, type: "asset/resource", generator: { filename } },
    { test: /\.svg$/i, type: "asset", parser: { dataUrlCondition: { maxSize: 8192 } }, generator: { filename } },
    { test: /\.json$/i, type: "json" },
  ];

  const serverRules: RuleSetRule[] = [
    ...sharedAssetRules,
    { test: /\.(png|jpe?g|gif|webp|avif|ico|svg)$/i, type: "asset/source" },
    { test: /\.json$/i, type: "json" },
  ];

  return { client: clientRules, server: serverRules };
}
