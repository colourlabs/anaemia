import { config as loadDotenv } from "dotenv";
import { expand as expandDotenv } from "dotenv-expand";

import path from "node:path";

export default function loadEnvFiles(appRoot: string, mode: string) {
  const files = [`.env`, `.env.local`, `.env.${mode}`, `.env.${mode}.local`];

  for (const file of files) {
    const result = loadDotenv({ path: path.resolve(appRoot, file), override: true, quiet: true });
    expandDotenv(result);
  }
}
