import { AnaemiaConfig } from "@anaemia/core/config";
import path from "path";
import fs from "fs";
import { createJiti } from "jiti";
import logger from "./logger.js";

interface UserConfigModule {
  default?: AnaemiaConfig;
  [key: string]: unknown;
}

export async function loadUserConfig(appRoot: string): Promise<AnaemiaConfig> {
  const configPath = path.resolve(appRoot, "anaemia.config.ts");
  if (!fs.existsSync(configPath)) return {};

  try {
    const jiti = createJiti(import.meta.url);
    const module = (await jiti.import(configPath)) as UserConfigModule;
    return (module.default ?? module) as AnaemiaConfig;
  } catch (err) {
    logger.error("failed parsing your anaemia.config.ts file:", err);
    return {};
  }
}
