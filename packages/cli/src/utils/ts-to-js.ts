import fs from "node:fs";
import path from "node:path";
import { transform } from "sucrase";
import logger from "./logger.js";

export function convertTypeScriptToJs(dir: string, isRoot: boolean = true): void {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      convertTypeScriptToJs(fullPath, false);
      continue;
    }

    if (file.endsWith(".d.ts") || file.endsWith(".d.tsx")) continue;
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
        .trimStart()
        .replace(/\.tsx(?=['"`])/g, ".jsx");

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

  if (isRoot) {
    const jsconfigPath = path.join(dir, "jsconfig.json");
    const jsconfig = {
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "bundler",
        checkJs: false,
        jsx: "preserve",
        jsxImportSource: "solid-js",
        rootDirs: [".", "./.anaemia/generated/css-modules"],
        paths: {
          "~/*": ["./src/*"],
          "@app/*": ["./src/app/*"],
          "@shared/*": ["./src/shared/*"],
          "@features/*": ["./src/features/*"],
          "@entities/*": ["./src/entities/*"],
          "@routes/*": ["./src/routes/*"],
        },
      },
      include: ["src", "./anaemia.config.js", "./anaemia.d.ts", "./.anaemia/generated/css-modules/**/*.d.ts"],
      exclude: ["node_modules", "dist", "./.anaemia/build"],
    };

    fs.writeFileSync(jsconfigPath, JSON.stringify(jsconfig, null, 2) + "\n", "utf8");

    const eslintConfigPath = path.join(dir, "eslint.config.js");

    if (fs.existsSync(eslintConfigPath)) {
      const content = fs.readFileSync(eslintConfigPath, "utf8");
      const updated = content.replace(/anaemia\(\{[^}]*typescript:\s*true[^}]*\}\)/, `anaemia({ typescript: false })`);
      fs.writeFileSync(eslintConfigPath, updated, "utf8");
    }
  }
}
