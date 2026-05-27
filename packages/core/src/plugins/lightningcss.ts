import { createRequire } from "node:module";
import type { AnaemiaPlugin } from "../config.js";

export function anaemiaLightningCssPlugin(options: { browserslist?: string[] } = {}): AnaemiaPlugin {
  const targets = options.browserslist ?? ["defaults", "not IE 11"];

  const localRequire = createRequire(import.meta.url);
  let rspackModule: any;
  
  try {
    rspackModule = localRequire("@rspack/core");
  } catch (err) {
    throw new Error(
      "[anaemia] The LightningCSS plugin requires '@rspack/core' to be available in the execution workspace."
    );
  }

  return {
    name: "anaemia-lightningcss-plugin",

    clientRspackConfig(config) {
      const isProd = process.env.NODE_ENV === "production";

      if (config.module?.rules) {
        config.module.rules.forEach((rule) => {
          if (rule && typeof rule === "object" && rule.test && rule.test.toString().includes("ss")) {
            const currentUse = Array.isArray(rule.use) ? rule.use : [];
            
            rule.use = [
              ...currentUse,
              {
                loader: "builtin:lightningcss-loader",
                options: { 
                  targets,
                  modules: rule.type === "css/auto",
                },
              },
            ];
          }
        });
      }

      if (isProd) {
        config.optimization = {
          ...config.optimization,
          minimize: true,
          minimizer: [
            ...(config.optimization?.minimizer ?? []),
            // Native Rust CSS minification engine
            new rspackModule.LightningCssMinimizerRspackPlugin({
              minimizerOptions: { targets },
            }),
          ],
        };
      }

      return config;
    },

    serverRspackConfig(config) {
      if (config.module?.rules) {
        config.module.rules.forEach((rule) => {
          if (rule && typeof rule === "object" && rule.test && rule.test.toString().includes("ss")) {
            const currentUse = Array.isArray(rule.use) ? rule.use : [];
            
            rule.use = [
              ...currentUse,
              {
                loader: "builtin:lightningcss-loader",
                options: { 
                  targets,
                  modules: rule.type === "css/auto",
                },
              },
            ];
          }
        });
      }
      return config;
    },
  };
}