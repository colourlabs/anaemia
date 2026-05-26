export interface AnaemiaConfig {
  /**
   * the network port the Hono production server should bind to.
   * @default 3000
   */
  port?: number;

  /**
   * global asset distribution options.
   */
  assets?: {
    /**
     * the public URL path where static bundles are mounted.
     * @default "/assets/"
     */
    publicPath?: string;
  };

  /**
   * internationalization options for localized routing.
   */
  i18n?: {
    locales: string[];
    defaultLocale: string;
  };

  styles?: {
    sass?: boolean;
    modules?: boolean;
  };

  /**
   * toggle advanced compiler settings or experiments.
   */
  experimental?: {
    /**
     * force the server bundle to emit as an ES Module.
     * @default true
     */
    outputModule?: boolean;
  };
}

export function defineConfig(config: AnaemiaConfig): AnaemiaConfig {
  return config;
}