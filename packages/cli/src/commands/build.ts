import type { CAC } from "cac";
import { rspack } from "@rspack/core";
import { getRspackConfig } from "@anaemia/bundler";
import { loadUserConfig } from "../utils/config.js";
import logger from "../utils/logger.js";

export function register(cli: CAC) {
  cli.command("build", "compile production-ready optimization bundles").action(async () => {
    process.env.NODE_ENV = "production";
    const appRoot = process.cwd();

    const userConfig = await loadUserConfig(appRoot);
    const configs = await getRspackConfig(appRoot, userConfig);
    const compiler = rspack(configs);

    logger.compiler("packaging production optimization bundles...");

    await new Promise<void>((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err || stats?.hasErrors()) {
          reject(err || new Error(stats?.toString("normal")));
          return;
        }
        compiler.close(() => resolve());
      });
    });
  });
}
