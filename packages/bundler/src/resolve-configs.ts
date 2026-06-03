import path from "node:path";
import fs from "node:fs";

export default function resolveUserConfig(appRoot: string): string {
  const candidates = ["anaemia.config.ts", "anaemia.config.js", "anaemia.config.mjs", "anaemia.config.cjs"];

  for (const candidate of candidates) {
    const full = path.join(appRoot, candidate);

    if (fs.existsSync(full)) {
      return full;
    }
  }

  throw new Error(
    "could not find anaemia.config.ts/js/mjs/cjs! please create one in the root of your project and export a valid config object from it.",
  );
}
