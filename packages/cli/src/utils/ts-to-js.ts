import fs from "node:fs";
import path from "node:path";
import { transform } from "sucrase";
import logger from "./logger.js";

export function convertTypeScriptToJs(dir: string): void {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      convertTypeScriptToJs(fullPath);
      continue;
    }

    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;

    const isTsx = file.endsWith(".tsx");
    const code = fs.readFileSync(fullPath, "utf8");

    try {
      const compiled = transform(code, {
        transforms: isTsx ? ["typescript", "jsx"] : ["typescript"],
        jsxRuntime: "preserve",
        production: true,
      });

      const cleaned = compiled.code
        .replace(/\n{3,}/g, "\n\n")
        .trimStart();

      const newPath = fullPath.replace(/\.tsx?$/, isTsx ? ".jsx" : ".js");
      fs.writeFileSync(newPath, cleaned, "utf8");
      fs.unlinkSync(fullPath);
    } catch {
      logger.warn(`failed to strip types from ${file}, skipping...`);
    }
  }

  const tsconfigPath = path.join(dir, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    fs.unlinkSync(tsconfigPath);
  }
}