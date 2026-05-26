import { Configuration, rspack } from "@rspack/core";
import path from "path";
import type { AnaemiaConfig } from "@anaemia/core";
import { createRequire } from "node:module";

import clientServerFnTransform from "./plugins/babel-transform-server.js";
import serverHashInjector from "./plugins/hash-injector-server.js";

const require = createRequire(import.meta.url);

export function getRspackConfig(appRoot: string, config: AnaemiaConfig = {}): [Configuration, Configuration] {
  const resolve = {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".scss"],
    extensionAlias: {
      ".js": [".ts", ".js"],
      ".jsx": [".tsx", ".jsx"]
    },
    alias: {
      "anaemia-user-app": path.resolve(appRoot, "./src/App.tsx"),
      "~": path.resolve(appRoot, "./src"),
    },
  };

  const coreRuntimeDir = path.dirname(require.resolve("@anaemia/core/package.json"));

  const useSass = config.styles?.sass !== false;
  const useModules = config.styles?.modules ?? true;

  const scssRule = {
    test: /\.scss$/,
    type: useModules ? "css/auto" : "css",
    use: useSass ? [{ loader: require.resolve("sass-loader"), options: { api: "modern" } }] : [],
  };
  
  const clientConfig: Configuration = {
    name: "client",
    context: appRoot,
    target: "web",
    entry: {
      client: path.resolve(coreRuntimeDir, "./src/runtime/entry-client.tsx"),
    },
    output: {
      path: path.resolve(appRoot, "./dist/client"),
      filename: "assets/[name].[contenthash:8].js",
      chunkFilename: "assets/[name].[contenthash:8].chunk.js",
      cssFilename: "assets/[name].[contenthash:8].css", 
      publicPath: config.assets?.publicPath || "/assets/",
    },
    resolve: {
      ...resolve,
      fallback: {
        "async_hooks": false,
        "node:async_hooks": false,
        "fs": false,
        "node:fs": false,
        "path": false,
        "node:path": false
      }
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: path.resolve(appRoot, "./index.html"),
        filename: "index.html",
        inject: true,
      }),
      new rspack.DefinePlugin({
        "__ANAEMIA_RUNTIME_CONFIG__": JSON.stringify({ i18n: config.i18n }),
      }),
      new rspack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    ],
    module: {
      parser: {
        "css/auto": {
          namedExports: false
        }
      },
      rules: [
        scssRule,
        {
          test: /\.(ts|tsx)$/,
          use: [
            {
              loader: require.resolve("babel-loader"),
              options: {
                presets: [
                  [require.resolve("babel-preset-solid"), { generate: "dom", hydratable: true }],
                  require.resolve("@babel/preset-typescript")
                ],
                plugins: [clientServerFnTransform, serverHashInjector], 
              },
            },
          ],
        },
      ],
    },
  };

  const serverConfig: Configuration = {
    name: "server",
    context: appRoot,
    target: "node",
    entry: {
      server: path.resolve(coreRuntimeDir, "./src/runtime/entry-server.tsx"),
    },
    output: {
      path: path.resolve(appRoot, "./dist/server"),
      filename: "index.js",
      module: true,
      chunkFormat: "module",
      chunkLoading: "import",
    },
    plugins: [
      new rspack.DefinePlugin({
        "__ANAEMIA_RUNTIME_CONFIG__": JSON.stringify({ i18n: config.i18n }),
      }),
    ],
    resolve,
    module: {
      parser: {
        "css/auto": {
          namedExports: false
        }
      },
      rules: [
        scssRule,
        {
          test: /\.(ts|tsx)$/,
          use: [
            {
              loader: require.resolve("babel-loader"),
              options: {
                presets: [
                  [require.resolve("babel-preset-solid"), { generate: "ssr", hydratable: true }],
                  require.resolve("@babel/preset-typescript")
                ],
              },
            },
          ],
        },
      ],
    },
  };

  return [clientConfig, serverConfig];
}