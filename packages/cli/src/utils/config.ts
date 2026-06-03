import type { AnaemiaConfig } from "@anaemia/core/config";
import path from "node:path";
import fs from "node:fs";
import { createJiti } from "jiti";
import logger from "./logger.js";

interface UserConfigModule {
  default?: AnaemiaConfig;
  [key: string]: unknown;
}

export async function loadUserConfig(appRoot: string): Promise<AnaemiaConfig> {
  const candidates = ["anaemia.config.ts", "anaemia.config.js", "anaemia.config.mjs", "anaemia.config.cjs"];

  let configPath: string | null = null;
  for (const candidate of candidates) {
    const full = path.resolve(appRoot, candidate);
    if (fs.existsSync(full)) {
      configPath = full;
      break;
    }
  }

  if (!configPath) return {};

  try {
    const jiti = createJiti(import.meta.url);
    const module = (await jiti.import(configPath)) as UserConfigModule;
    return (module.default ?? module) as AnaemiaConfig;
  } catch (err) {
    logger.error(`failed parsing your config file:`, err);
    return {};
  }
}
