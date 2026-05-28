import { Hono } from "hono";
import type { Configuration } from "@rspack/core";
import type { PluginItem } from "@babel/core";

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
  configureServer?: (app: Hono) => void;

  /**
   * transform the final HTML string before it is sent to the client.
   */
  transformHtml?: (html: string) => string | Promise<string>;
}

export interface AnaemiaConfig {
  port?: number;
  assets?: {
    publicPath?: string;
  };
  styles?: {
    sass?: boolean;
    modules?: boolean;
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
