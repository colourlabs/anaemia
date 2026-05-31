import type { Configuration } from "@rspack/core";
import { rspack } from "@rspack/core";
import path from "node:path";
import fs from "node:fs";
import type { AnaemiaConfig } from "@anaemia/core/config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import clientServerFnTransform from "./plugins/babel-transform-server.js";
import serverHashInjector from "./plugins/babel-hash-injector-server.js";
import { AnaemiaManifestHydrationPlugin } from "./plugins/rspack-manifest-hydration.js";

import { scanRoutes, scanServerRoutes } from "./router/scan.js";
import { writeManifest } from "./router/manifest.js";
import { generateRouterEntry } from "./router/generate-entry.js";
import { generateServerRoutes } from "./router/generate-server-routes.js";
import { getAliases } from "./aliases.js";

import { createStyleRules, createBabelRule, createAssetRules } from "./rules.js";
import { getClientOptimization, getPerformanceProfile } from "./optimization.js";
import loadEnvFiles from "./env-loader.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getRspackConfig(
  appRoot: string,
  config: AnaemiaConfig = {},
): Promise<[Configuration, Configuration]> {
  const isDev = process.env.NODE_ENV !== "production";
  loadEnvFiles(appRoot, process.env.NODE_ENV || "development");

  const coreRuntimeDir = path.dirname(require.resolve("@anaemia/core/package.json"));
  const runtimeDir = path.resolve(coreRuntimeDir, "./dist/runtime");

  const routes = await scanRoutes(appRoot);
  const serverRoutes = scanServerRoutes(appRoot);
  writeManifest(appRoot, routes);

  const frameworkInternalDir = path.resolve(appRoot, "./.anaemia");
  if (!fs.existsSync(frameworkInternalDir)) {
    fs.mkdirSync(frameworkInternalDir, { recursive: true });
  }

  // bootstrap config entries and generate necessary files for the router based on the scanned routes
  const entryFile = generateRouterEntry(appRoot, routes);
  const serverRoutesFile = generateServerRoutes(appRoot, serverRoutes);

  const styleRules = createStyleRules(config);
  const assetRules = createAssetRules(isDev);

  // allow users to inject additional babel plugins via the config, which is useful for things like macros or other code transforms that need to run at compile time
  const extraClientBabelPlugins = config.plugins?.flatMap((p) => p.babelPlugins?.client ?? []) ?? [];
  const extraServerBabelPlugins = config.plugins?.flatMap((p) => p.babelPlugins?.server ?? []) ?? [];
  const solidRefreshPlugin = [require.resolve("solid-refresh/babel"), { bundler: "rspack-esm", jsx: false }];

  /**
   * env processing:
   *
   * - we inject some default env vars like MODE, DEV, and PROD for convenience
   * - for the server, we expose all env vars
   * - for the client, we only expose vars that start with PUBLIC_, as well as the same defaults
   * - users can also define additional compile-time constants via config.define.client and config.define.server, which are merged into the rspack DefinePlugin config
   */
  const serverEnv: Record<string, string> = {
    MODE: JSON.stringify(process.env.NODE_ENV || "development"),
    DEV: JSON.stringify(isDev),
    PROD: JSON.stringify(!isDev),
  };

  for (const key in process.env) {
    serverEnv[key] = JSON.stringify(process.env[key]);
  }

  const clientEnv: Record<string, string> = {
    MODE: JSON.stringify(process.env.NODE_ENV || "development"),
    DEV: JSON.stringify(isDev),
    PROD: JSON.stringify(!isDev),
  };

  for (const key in process.env) {
    if (key.startsWith("PUBLIC_")) {
      clientEnv[key] = JSON.stringify(process.env[key]);
    }
  }

  // shared resolve config
  // we set up some shared resolve config between client and server here, like extension aliases and path aliases
  const sharedResolve = {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".json", ".scss", ".css"],
    extensionAlias: { ".js": [".ts", ".js"], ".jsx": [".tsx", ".jsx"] },
    alias: { "anaemia-user-app": entryFile, ...getAliases(appRoot) },
  };

  // client and server configurations
  let clientConfig: Configuration = {
    name: "client",
    context: appRoot,
    target: "web",
    devtool: isDev ? "eval-cheap-module-source-map" : false,
    cache: isDev,
    entry: {
      client: [...(isDev ? [require.resolve("solid-refresh")] : []), path.resolve(runtimeDir, "entry-client.jsx")],
    },
    output: {
      path: path.resolve(appRoot, "./dist/client"),
      filename: isDev ? "assets/[name].js" : "assets/[name].[contenthash:8].js",
      chunkFilename: isDev ? "assets/[name].chunk.js" : "assets/[name].[contenthash:8].chunk.js",
      cssFilename: isDev ? "assets/[name].css" : "assets/[name].[contenthash:8].css",
      publicPath: "/",
    },
    performance: getPerformanceProfile(isDev),
    optimization: getClientOptimization(isDev),
    resolve: {
      ...sharedResolve,
      conditionNames: ["solid", "browser", ...(isDev ? ["development"] : []), "import", "..."],
      alias: {
        ...sharedResolve.alias,
        "solid-refresh": require.resolve("solid-refresh"),
        [path.resolve(coreRuntimeDir, "./dist/runtime/context.js")]: path.resolve(
          coreRuntimeDir,
          "./dist/runtime/context.browser.js",
        ),
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
          port: (config.port ?? 3000) + 1,
          allowedHosts: "all",
          headers: { "Access-Control-Allow-Origin": "*" },
          client: { webSocketURL: `ws://localhost:${(config.port ?? 3000) + 2}` },
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
        "import.meta.env": clientEnv,
      }),
      new rspack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
      new rspack.NormalModuleReplacementPlugin(
        /\.server\.(ts|tsx|js|jsx)$/,
        (() => {
          const srcPath = path.resolve(__dirname, "./runtime/empty-module.cjs");
          if (fs.existsSync(srcPath)) return srcPath;

          return path.resolve(__dirname, "../src/runtime/empty-module.cjs");
        })(),
      ),
      new AnaemiaManifestHydrationPlugin({ appRoot }),
    ],
    module: {
      parser: { "css/auto": { namedExports: false } },
      rules: [
        styleRules.client,
        ...assetRules.client,
        {
          ...createBabelRule({
            isServer: false,
            isDev,
            plugins: [clientServerFnTransform, ...(isDev ? [solidRefreshPlugin] : []), ...extraClientBabelPlugins],
          }),
          exclude: (modulePath: string) => {
            if (modulePath.includes("@anaemia") && modulePath.includes("core")) return false;
            if (modulePath.includes("@solidjs") && modulePath.includes("router")) return false;
            return modulePath.includes("node_modules");
          },
        },
      ],
    },
  };

  let serverConfig: Configuration = {
    name: "server",
    devtool: isDev ? "source-map" : false,
    context: appRoot,
    target: "node",
    entry: { server: path.resolve(runtimeDir, "entry-server.jsx") },
    output: {
      path: path.resolve(appRoot, "./dist/server"),
      filename: "index.js",
      module: true,
      chunkFormat: "module",
      chunkLoading: "import",
    },
    optimization: { nodeEnv: false },
    resolve: {
      ...sharedResolve,
      conditionNames: ["node", "solid", ...(isDev ? ["development"] : []), "import", "..."],
      alias: {
        ...sharedResolve.alias,
        "solid-refresh": require.resolve("solid-refresh"),
        "@anaemia/core/config": path.resolve(coreRuntimeDir, "./dist/config.js"),
        "@anaemia/core": path.resolve(coreRuntimeDir, "./dist/index.js"),
        __anaemia_user_config__: path.resolve(appRoot, "./anaemia.config.ts"),
        __anaemia_server_routes__: serverRoutesFile,
      },
    },
    plugins: [new rspack.DefinePlugin({ ...config.define?.server, "import.meta.env": serverEnv })],
    module: {
      parser: { "css/auto": { namedExports: false } },
      rules: [
        styleRules.server,
        ...assetRules.server,
        {
          ...createBabelRule({
            isServer: true,
            isDev,
            plugins: [serverHashInjector, ...extraServerBabelPlugins],
          }),
          exclude: (modulePath: string) => {
            if (modulePath.includes("@anaemia") && modulePath.includes("core")) return false;
            if (modulePath.includes("@solidjs") && modulePath.includes("router")) return false;
            return modulePath.includes("node_modules");
          },
        },
      ],
    },
  };

  // allow plugins to modify the client and server configurations before they are returned
  for (const plugin of config.plugins ?? []) {
    if (plugin.clientRspackConfig) clientConfig = plugin.clientRspackConfig(clientConfig);
    if (plugin.serverRspackConfig) serverConfig = plugin.serverRspackConfig(serverConfig);
  }

  return [clientConfig, serverConfig];
}

export { scanRoutes } from "./router/scan.js";
export { writeManifest } from "./router/manifest.js";
