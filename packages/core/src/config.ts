import type { Configuration } from "@rspack/core";
import type { PluginItem } from "@babel/core";
import type { ServerApp } from "./index.js";

export interface AnaemiaPlugin {
  /**
   * unique identifier for the plugin.
   */
  name: string;

  /**
   * extend or modify the rspack config for the client bundle.
   */
  clientRspackConfig?: (config: Configuration) => Configuration;

  /**
   * extend or modify the rspack config for the server bundle.
   */
  serverRspackConfig?: (config: Configuration) => Configuration;

  /**
   * add additional babel plugins to the client transform pipeline.
   */
  babelPlugins?: {
    client?: PluginItem[];
    server?: PluginItem[];
  };

  /**
   * hook into the Hono app instance to register additional routes or middleware.
   */
  configureServer?: (app: ServerApp) => void;

  /**
   * inject into the <head> of every page
   */
  injectHead?: () => string | Promise<string>;

  /**
   * inject before </body> of every page
   */
  injectBody?: () => string | Promise<string>;

  /**
   * inject at the start of <body>, before the app renders.
   * useful for scripts that must run before first paint to avoid flashes,
   * such as theme detection or feature flag bootstrapping.
   */
  injectBodyStart?: () => string | Promise<string>;
}

export interface AnaemiaConfig {
  port?: number;
  assets?: {
    publicPath?: string;
  };

  styles?: {
    sass?: boolean;
    modules?: boolean;

    /**
     * customize the generated CSS module class names.
     * defaults to "[name]__[local]__[hash:base64:5]" in both development and production
     * for readable, themeable class names. Set to "[hash:base64:8]" if you prefer
     * fully hashed production output and don't need external theme support.
     */
    modulesLocalIdentName?: string;
  };

  experimental?: {
    outputModule?: boolean;
  };

  /**
   * list of anaemia plugins to apply to the build and runtime.
   */
  plugins?: AnaemiaPlugin[];

  /**
   * inject global constants into the client and/or server bundles at build time.
   * values must be JSON-serializable expressions — wrap strings in JSON.stringify.
   * @example
   * define: {
   *   client: { __APP_VERSION__: JSON.stringify("1.0.0") },
   *   server: { __DB_POOL_SIZE__: "10" }
   * }
   */
  define?: {
    client?: Record<string, string>;
    server?: Record<string, string>;
  };
}

export function defineConfig(config: AnaemiaConfig): AnaemiaConfig {
  return config;
}

export function definePlugin(plugin: AnaemiaPlugin): AnaemiaPlugin {
  return plugin;
}
