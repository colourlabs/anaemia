import path from "node:path";
import type { RuntimeEnv } from "./types.js";

export function createRuntimeEnv(processEnv: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const port = Number(processEnv.PORT) || 3000;
  const isDev = processEnv.NODE_ENV !== "production";
  const devPort = Number(processEnv.RSPACK_DEV_PORT) || 4445;

  return {
    port,
    isDev,
    devServerUrl: `http://localhost:${devPort}`,
    templatePath: path.resolve(process.cwd(), "./.anaemia/client/index.html"),
    manifestPath: path.resolve(process.cwd(), "./.anaemia/route-manifest.json"),
    clientDistPath: path.resolve(process.cwd(), "./.anaemia/client"),
  };
}
