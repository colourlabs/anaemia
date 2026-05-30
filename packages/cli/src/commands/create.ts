import type { CAC } from "cac";
import logger from "../utils/logger.js";
import path from "path";
import fs from "fs";
import pc from "picocolors";
import { generateSharedComponent, scaffoldFeature, scaffoldHook, scaffoldPage } from "../scaffold.js";
import prompts from "prompts";
import { transform } from "sucrase";
import { fileURLToPath } from "node:url";
import { fetchTemplate } from "../utils/fetch-template.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function register(cli: CAC) {
  cli
    .command("create [target]", "initialize an application or generate domain features (e.g., feature:name)")
    .alias("init")
    .action(async (target) => {
      const appRoot = process.cwd();

      if (target && target.includes(":")) {
        const [type, name] = target.split(":");

        if (!name) {
          logger.error(`missing name modifier. Use layout template like: ${pc.cyan(`create ${type}:your-name`)}`);
          process.exit(1);
        }

        if (!fs.existsSync(path.join(appRoot, "package.json"))) {
          logger.error("no package.json detected. code generation commands must run inside an Anaemia project root.");
          process.exit(1);
        }

        const normalizedName = name.trim();

        if (type === "feature") {
          scaffoldFeature(normalizedName, appRoot);
          return;
        }

        if (type === "component") {
          generateSharedComponent(appRoot, normalizedName, { logger, pc });
          return;
        }

        if (type === "page") {
          scaffoldPage(normalizedName, appRoot);
          return;
        }

        if (type === "hook") {
          scaffoldHook(normalizedName, appRoot);
          return;
        }

        logger.error(`unknown layout generator type "${type}". Supported variants: "feature:", "component:", "page:", "hook:"`);
        process.exit(1);
      }

      logger.compiler("launching Anaemia project initialization wizard...");

      const response = await prompts([
        {
          type: target ? null : "text",
          name: "projectName",
          message: "Project name:",
          initial: "anaemia-app",
        },
        {
          type: "select",
          name: "variant",
          message: "Select a variant:",
          choices: [
            { title: pc.blue("TypeScript (Recommended)"), value: "ts" },
            { title: pc.yellow("JavaScript"), value: "js" },
          ],
          initial: 0,
        },
      ]);

      if (!response.variant && response.variant !== 0) {
        logger.warn("project creation aborted.");
        process.exit(0);
      }

      const targetDir = target || response.projectName;
      const targetPath = path.resolve(appRoot, targetDir);

      if (fs.existsSync(targetPath)) {
        const files = fs.readdirSync(targetPath);
        if (files.length > 0) {
          const { overwrite } = await prompts({
            type: "confirm",
            name: "overwrite",
            message: `target directory "${targetDir}" is not empty. remove existing files and continue?`,
            initial: false,
          });

          if (!overwrite) {
            logger.error("aborted to protect existing project directory.");
            process.exit(1);
          }

          logger.warn(`purging existing files inside ${targetDir}...`);
          fs.rmSync(targetPath, { recursive: true, force: true });
          fs.mkdirSync(targetPath, { recursive: true });
        }
      } else {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      let templatePath = path.resolve(__dirname, "../templates/template-base");
      if (!fs.existsSync(templatePath)) {
        templatePath = path.resolve(__dirname, "../templates/base-app");
      }

      if (fs.existsSync(templatePath)) {
        logger.info("unpacking localized scaffolding architecture layout structures...");
        fs.cpSync(templatePath, targetPath, {
          recursive: true,
          filter: (src) => !["node_modules", "dist", ".anaemia", ".rspack"].includes(path.basename(src)),
        });
      } else {
        logger.info("fetching template from remote registry...");
        await fetchTemplate(targetPath);
      }

      const removeGitKeepFiles = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            removeGitKeepFiles(fullPath);
          } else if (file === ".gitkeep") {
            fs.unlinkSync(fullPath);
          }
        }
      };
      removeGitKeepFiles(targetPath);

      if (response.variant === "js") {
        logger.info("converting workspace assets to vanilla JavaScript...");

        const convertTypeScriptToJs = (dir: string) => {
          const files = fs.readdirSync(dir);

          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              convertTypeScriptToJs(fullPath);
            } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
              const isTsx = file.endsWith(".tsx");
              const code = fs.readFileSync(fullPath, "utf8");

              try {
                const compiled = transform(code, {
                  transforms: isTsx ? ["typescript", "jsx"] : ["typescript"],
                  jsxRuntime: "preserve",
                  production: true,
                });

                const newExt = isTsx ? ".jsx" : ".js";
                const newPath = fullPath.replace(/\.tsx?$/, newExt);

                fs.writeFileSync(newPath, compiled.code, "utf8");
                fs.unlinkSync(fullPath);
              } catch {
                logger.warn(`failed to strip types from ${file}, skipping...`);
              }
            }
          }
        };

        convertTypeScriptToJs(targetPath);

        const tsconfigPath = path.join(targetPath, "tsconfig.json");
        if (fs.existsSync(tsconfigPath)) {
          fs.unlinkSync(tsconfigPath);
        }
      }

      const pkgJsonPath = path.join(targetPath, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
          pkg.name = path.basename(targetPath);

          if (response.variant === "js") {
            if (pkg.devDependencies) {
              delete pkg.devDependencies["typescript"];
              delete pkg.devDependencies["@types/node"];
              delete pkg.devDependencies["@typescript-eslint/eslint-plugin"];
              delete pkg.devDependencies["@typescript-eslint/parser"];
            }
            if (pkg.scripts && pkg.scripts.typecheck) {
              delete pkg.scripts.typecheck;
            }
          }

          fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), "utf8");
        } catch (err) {
          logger.error("failed rewriting package.json manifest structures:", err);
        }
      }

      logger.success(`\n🎉 project successfully scaffolded into ${pc.magenta(targetDir)}!`);
      console.log(pc.dim("\nfollow these steps to begin execution:\n"));

      if (targetDir !== ".") {
        console.log(`  cd ${pc.cyan(targetDir)}`);
      }
      console.log(`  ${pc.cyan("pnpm install")}    ${pc.dim("# or npm i / yarn install")}`);
      console.log(`  ${pc.cyan("pnpm dev")}        ${pc.dim("# launches hot reload server")}\n`);
    });
}
