import { Configuration, rspack } from "@rspack/core";
import path from "path";
import fs from "node:fs";
import type { AnaemiaConfig } from "@anaemia/core";
import { createRequire } from "node:module";

import clientServerFnTransform from "./plugins/babel-transform-server.js";
import serverHashInjector from "./plugins/babel-hash-injector-server.js";

import { AnaemiaManifestHydrationPlugin } from "./plugins/rspack-manifest-hydration.js";

import { scanRoutes, scanServerRoutes } from "./router/scan.js";
import { writeManifest } from "./router/manifest.js";
import { generateRouterEntry } from "./router/generate-entry.js";
import { generateServerRoutes } from "./router/generate-server-routes.js";

const require = createRequire(import.meta.url);

export function getRspackConfig(appRoot: string, config: AnaemiaConfig = {}): [Configuration, Configuration] {
  const isDev = process.env.NODE_ENV !== "production";

  const routes = scanRoutes(appRoot);
  const serverRoutes = scanServerRoutes(appRoot);
  writeManifest(appRoot, routes);

  const frameworkInternalDir = path.resolve(appRoot, "./.anaemia");
  if (!fs.existsSync(frameworkInternalDir)) {
    fs.mkdirSync(frameworkInternalDir, { recursive: true });
  }

  const entryFile = generateRouterEntry(appRoot, routes);
  const serverRoutesFile = generateServerRoutes(appRoot, serverRoutes);

  const resolve = {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".json", ".scss", ".css"],
    extensionAlias: {
      ".js": [".ts", ".js"],
      ".jsx": [".tsx", ".jsx"],
    },
    alias: {
      "anaemia-user-app": entryFile,
      "~": path.resolve(appRoot, "./src"),
      "@core": path.resolve(appRoot, "./src/core"),
      "@shared": path.resolve(appRoot, "./src/shared"),
      "@features": path.resolve(appRoot, "./src/features"),
    },
  };

  const coreRuntimeDir = path.dirname(require.resolve("@anaemia/core/package.json"));
  const plugins = config.plugins ?? [];

  const extraClientBabelPlugins = plugins.flatMap((p) => p.babelPlugins?.client ?? []);
  const extraServerBabelPlugins = plugins.flatMap((p) => p.babelPlugins?.server ?? []);

  const useSass = config.styles?.sass !== false;
  const useModules = config.styles?.modules ?? true;

  const clientCssRule = {
    test: /\.(c|sc|sa)ss$/,
    type: useModules ? "css/auto" : "css",
    use: useSass ? [{ loader: require.resolve("sass-loader"), options: { api: "modern" } }] : [],
  };

  const serverCssRule = {
    test: /\.(c|sc|sa)ss$/,
    type: useModules ? "css/auto" : "css",
    generator: {
      css: {
        exportOnlyLocals: true,
      },
    },
    use: useSass ? [{ loader: require.resolve("sass-loader"), options: { api: "modern" } }] : [],
  };

  let clientConfig: Configuration = {
    name: "client",
    context: appRoot,
    target: "web",
    devtool: isDev ? "eval-cheap-module-source-map" : false,
    cache: true,
    entry: {
      client: path.resolve(coreRuntimeDir, "./src/runtime/entry-client.tsx"),
    },
    output: {
      path: path.resolve(appRoot, "./dist/client"),
      filename: isDev ? "assets/[name].js" : "assets/[name].[contenthash:8].js",
      chunkFilename: isDev ? "assets/[name].chunk.js" : "assets/[name].[contenthash:8].chunk.js",
      cssFilename: isDev ? "assets/[name].css" : "assets/[name].[contenthash:8].css",
      publicPath: "/",
    },
    performance: isDev
      ? {
          hints: false,
          maxAssetSize: 1000000,
          maxEntrypointSize: 1000000,
        }
      : {
          hints: "warning", // enable strict warnings only during production bundling
          maxAssetSize: 307200, // 300 KiB
          maxEntrypointSize: 512000, // 500 KiB
        },
    optimization: {
      sideEffects: true,
      usedExports: true,
      splitChunks: isDev
        ? false
        : {
            chunks: "all",
            maxInitialRequests: 25, // prevents HTTP/2 multiplexing limits
            minSize: 20000, // only split modules if they are bigger than 20kb
            cacheGroups: {
              framework: {
                chunks: "all",
                name: "framework",
                test: /[\\/]node_modules[\\/](solid-js|@solidjs[\\/]router)[\\/]/,
                priority: 40,
                enforce: true,
              },
              vendor: {
                chunks: "all",
                name: "vendor",
                test: /[\\/]node_modules[\\/]/,
                priority: 30,
              },
            },
          },
      minimizer: isDev ? [] : [new rspack.SwcJsMinimizerRspackPlugin()],
    },
    resolve: {
      ...resolve,
      conditionNames: ["solid", "browser", ...(isDev ? ["development"] : []), "import", "..."],
      alias: {
        ...resolve.alias,
        "solid-refresh": require.resolve("solid-refresh"),
        [path.resolve(coreRuntimeDir, "./src/runtime/context.ts")]: path.resolve(coreRuntimeDir, "./src/runtime/context.browser.ts"),
        [path.resolve(coreRuntimeDir, "./dist/runtime/context.js")]: path.resolve(coreRuntimeDir, "./src/runtime/context.browser.ts"),
      },
      fallback: {
        async_hooks: false,
        "node:async_hooks": false,
        fs: false,
        "node:fs": false,
        path: false,
        "node:path": false,
      },
    },
    devServer: isDev
      ? {
          hot: true,
          liveReload: false,
          port: config.port ? config.port + 1 : 4445,
          allowedHosts: "all",
          headers: { "Access-Control-Allow-Origin": "*" },
          client: {
            webSocketURL: `ws://localhost:${config.port || 4444}/_anaemia_hmr`,
          },
        }
      : undefined,
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: path.resolve(appRoot, "./index.html"),
        filename: "index.html",
        inject: false,
      }),
      new rspack.DefinePlugin({
        __ANAEMIA_RUNTIME_CONFIG__: JSON.stringify({
          port: config.port,
          assets: config.assets,
          styles: config.styles,
        }),
        ...config.define?.client,
      }),
      new rspack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
      new AnaemiaManifestHydrationPlugin({ appRoot }),
    ],
    module: {
      parser: { "css/auto": { namedExports: false } },
      rules: [
        clientCssRule,
        {
          test: /\.[jt]sx?$/,
          exclude: /[\\/]node_modules[\\/]/,
          use: [
            {
              loader: require.resolve("babel-loader"),
              options: {
                presets: [[require.resolve("babel-preset-solid"), { generate: "dom", hydratable: true, dev: isDev }], require.resolve("@babel/preset-typescript")],
                plugins: [clientServerFnTransform, ...(isDev ? [[require.resolve("solid-refresh/babel"), { bundler: "rspack-esm" }]] : []), ...extraClientBabelPlugins],
              },
            },
          ],
        },
        {
          test: /\.[jt]sx?$/,
          include: /[\\/]node_modules[\\/]@solidjs[\\/]router/,
          use: [
            {
              loader: require.resolve("babel-loader"),
              options: {
                presets: [[require.resolve("babel-preset-solid"), { generate: "dom", hydratable: true, dev: isDev }], require.resolve("@babel/preset-typescript")],
                plugins: [clientServerFnTransform, ...extraClientBabelPlugins],
              },
            },
          ],
        },
      ],
    },
  };

  let serverConfig: Configuration = {
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
    optimization: {
      nodeEnv: false,
    },
    resolve: {
      ...resolve,
      conditionNames: ["node", "solid", ...(isDev ? ["development"] : []), "import", "..."],
      alias: {
        ...resolve.alias,
        "solid-refresh": require.resolve("solid-refresh"),
        "@anaemia/core": path.resolve(coreRuntimeDir, "./src/index.ts"),
        __anaemia_user_config__: path.resolve(appRoot, "./anaemia.config.ts"),
        __anaemia_server_routes__: serverRoutesFile,
      },
    },
    plugins: [
      new rspack.DefinePlugin({
        ...config.define?.server,
      }),
    ],
    module: {
      parser: { "css/auto": { namedExports: false } },
      rules: [
        serverCssRule,
        {
          test: /\.[jt]sx?$/,
          exclude: /[\\/]node_modules[\\/]/,
          use: [
            {
              loader: require.resolve("babel-loader"),
              options: {
                presets: [[require.resolve("babel-preset-solid"), { generate: "ssr", hydratable: true, dev: isDev }], require.resolve("@babel/preset-typescript")],
                plugins: [...(isDev ? [[require.resolve("solid-refresh/babel"), { bundler: "rspack-esm" }]] : []), serverHashInjector, ...extraServerBabelPlugins],
              },
            },
          ],
        },
        {
          test: /\.[jt]sx?$/,
          include: /[\\/]node_modules[\\/]@solidjs[\\/]router/,
          use: [
            {
              loader: require.resolve("babel-loader"),
              options: {
                presets: [[require.resolve("babel-preset-solid"), { generate: "ssr", hydratable: true, dev: isDev }], require.resolve("@babel/preset-typescript")],
                plugins: [...extraServerBabelPlugins],
              },
            },
          ],
        },
      ],
    },
  };

  for (const plugin of plugins) {
    if (plugin.clientRspackConfig) clientConfig = plugin.clientRspackConfig(clientConfig);
    if (plugin.serverRspackConfig) serverConfig = plugin.serverRspackConfig(serverConfig);
  }

  return [clientConfig, serverConfig];
}

export { scanRoutes } from "./router/scan.js";
export { writeManifest } from "./router/manifest.js";
