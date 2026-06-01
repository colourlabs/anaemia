import { createRequire } from "node:module";
import type { AnaemiaPlugin } from "@anaemia/core/config";
import type { Configuration, RuleSetRule } from "@rspack/core";

const require = createRequire(import.meta.url);

interface AnaemiaMdxOptions {
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
}

export function mdx(options: AnaemiaMdxOptions = {}): AnaemiaPlugin {
  const mdxRule: RuleSetRule = {
    test: /\.mdx?$/,
    use: [
      {
        loader: require.resolve("@mdx-js/loader"),
        options: {
          jsxImportSource: "solid-js/h",
          jsx: true,
          ...options,
        },
      },
    ],
  };

  const addMdxRule = (config: Configuration): Configuration => ({
    ...config,
    resolve: {
      ...config.resolve,
      extensions: [".mdx", ".md", ...(config.resolve?.extensions ?? [])],
    },
    module: {
      ...config.module,
      rules: [mdxRule, ...(config.module?.rules ?? [])],
    },
  });

  return {
    name: "@anaemia/plugin-mdx",
    clientRspackConfig: addMdxRule,
    serverRspackConfig: addMdxRule,
  };
}
