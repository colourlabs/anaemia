import type { AnaemiaPlugin } from "../config.js";

interface EnvRequirements {
  all?: string[];
  production?: string[];
  development?: string[];
  [mode: string]: string[] | undefined; // support arbitrary modes
}

interface AnaemiaEnvPluginOptions {
  required?: EnvRequirements | string[]; // allow shorthand array for simple cases
  optional?: string[];
}

export function anaemiaEnvCheckerPlugin(options: AnaemiaEnvPluginOptions = {}): AnaemiaPlugin {
  return {
    name: "anaemia-env-checker-plugin",
    clientRspackConfig: (config) => {
      const mode = process.env.NODE_ENV ?? "development";

      const required = Array.isArray(options.required)
        ? options.required
        : [...(options.required?.all ?? []), ...(options.required?.[mode] ?? [])];

      const missing = required.filter((key) => !process.env[key]);

      if (missing.length > 0) {
        throw new Error(
          `[anaemia-env-checker] missing required environment variables for ${mode}:\n${missing.map((k) => `  - ${k}`).join("\n")}`,
        );
      }

      return config;
    },
  };
}
