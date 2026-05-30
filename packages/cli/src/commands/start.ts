import type { CAC } from "cac";
import { loadUserConfig } from "../utils/config.js";
import spawn from "cross-spawn";
import path from "path";

export function register(cli: CAC) {
  cli.command("start", "serve the production build").action(async () => {
    const appRoot = process.cwd();
    const userConfig = await loadUserConfig(appRoot);
    const targetPort = userConfig.port || 3000;

    spawn("node", [path.resolve(appRoot, "./dist/server/index.js")], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", PORT: String(targetPort) },
    });
  });
};
