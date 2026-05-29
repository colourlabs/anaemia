#!/usr/bin/env node
import { cac } from "cac";
import pc from "picocolors";
import { rspack } from "@rspack/core";
import { RspackDevServer } from "@rspack/dev-server";
import { getRspackConfig, scanRoutes } from "@anaemia/bundler";
import spawn from "cross-spawn";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import fs from "node:fs";
import { ChildProcess, execSync } from "node:child_process";
import prompts from "prompts";
import { scaffoldFeature, generateSharedComponent, scaffoldPage, scaffoldHook } from "./scaffold.js";
import { transform } from "sucrase";
import { WebSocketServer } from "ws";
import { WebSocket as NodeWS } from "ws";
import logger from "./logger.js";
import http from "node:http";
import { AnaemiaConfig } from "@anaemia/core/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cli = cac("anaemia");

interface UserConfigModule {
  default?: AnaemiaConfig;
  [key: string]: unknown;
}

async function loadUserConfig(appRoot: string): Promise<AnaemiaConfig> {
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

cli.command("dev", "launch local development environment").action(async () => {
  process.env.NODE_ENV = "development";
  const appRoot = process.cwd();

  const userConfig = await loadUserConfig(appRoot);
  const targetPort = userConfig.port || 3000;

  const [clientConfig, serverConfig] = await getRspackConfig(appRoot, userConfig);

  const clientCompiler = rspack(clientConfig);
  const devServer = new RspackDevServer(clientConfig.devServer || {}, clientCompiler);

  const bridgeServer = http.createServer();
  const wss = new WebSocketServer({ server: bridgeServer });

  wss.on("connection", (clientWs) => {
    const rspackSocket = new NodeWS(`ws://localhost:${targetPort + 1}/ws`);
  
    rspackSocket.on("message", (data) => {
      const flattened = Array.isArray(data) ? Buffer.concat(data) : data;
      if (Buffer.isBuffer(flattened)) clientWs.send(flattened.toString("utf-8"));
      else clientWs.send(String(flattened));
    });
  
    rspackSocket.on("error", (err) => {
      console.warn("[anaemia hmr] rspack socket error:", err.message);
    });
  
    clientWs.on("message", (data) => {
      if (rspackSocket.readyState === NodeWS.OPEN) rspackSocket.send(data);
    });
  
    clientWs.on("close", () => {
      if (rspackSocket.readyState === NodeWS.OPEN) rspackSocket.close();
    });
  });

  let serverProcess: ChildProcess | null = null;

  const startServer = () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }

    setTimeout(() => {
      serverProcess = spawn("node", [path.resolve(appRoot, "./dist/server/index.js")], {
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "development", PORT: String(targetPort), RSPACK_DEV_PORT: String(targetPort + 1) },
      });
    }, 200);
  };

  const cleanup = async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
    bridgeServer.close();
    serverCompiler?.close(() => {});
    if (devServer) {
      await devServer.stop();
    }
    process.exit(0);
  };  

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  logger.compiler("warming up and analyzing assets...");

  try {
    await devServer.start();
    logger.success(`hot reload asset infrastructure running on port ${targetPort + 1}`);
  } catch (err) {
    logger.error("failed to start client asset dev server:", err);
    process.exit(1);
  }

  bridgeServer.listen(targetPort + 2, () => {
    logger.info(`HMR bridge running on port ${targetPort + 2}`);
  });

  const serverCompiler = rspack(serverConfig);

  serverCompiler.watch({}, (err, stats) => {
    if (err) {
      logger.error("server compilation critical failure:", err);
      return;
    }

    if (stats?.hasErrors()) {
      console.error(stats.toString({ colors: true, all: false, errors: true, warnings: true }));
      logger.error("server compilation encountered build script errors.");
      return;
    }

    logger.info(`server bundles updated. booting runtime on http://localhost:${targetPort}`);
    startServer();
  });
});

cli.command("start", "serve the production build").action(async () => {
  const appRoot = process.cwd();
  const userConfig = await loadUserConfig(appRoot);
  const targetPort = userConfig.port || 3000;

  spawn("node", [path.resolve(appRoot, "./dist/server/index.js")], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", PORT: String(targetPort) },
  });
});

cli.command("typecheck", "run TypeScript type checking without emitting").action(async () => {
  const appRoot = process.cwd();
  const result = spawn.sync("tsc", ["--noEmit"], { stdio: "inherit", cwd: appRoot });
  if (result.status !== 0) process.exit(result.status ?? 1);
});

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

cli.command("routes", "print the scanned route manifest").action(async () => {
  const appRoot = process.cwd();
  const routes = scanRoutes(appRoot);

  logger.info("scanned route architecture:");
  console.table(
    (await routes).map((r) => ({
      pattern: r.urlPattern,
      chunk: r.chunkName,
      layouts: r.layouts.length,
      params: r.params.join(", ") || "—",
      type: r.type,
    }))
  );
});

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
      logger.warn("local templates missing. fetching remote registry packages over the network...");
      const userAgent = process.env.npm_config_user_agent || "";
      let packageManager = "npm";
      if (userAgent.includes("pnpm")) packageManager = "pnpm";
      else if (userAgent.includes("yarn")) packageManager = "yarn";

      try {
        if (packageManager === "pnpm") {
          execSync(`pnpm dlx dlx-unzip @anaemia/template-base "${targetPath}"`, { stdio: "ignore" });
        } else {
          execSync(`npx degit colourlabs/anaemia/templates/base-app "${targetPath}"`, { stdio: "ignore" });
        }
      } catch {
        logger.error("Could not source template workspace assets locally or from network registry nodes.");
        process.exit(1);
      }
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

cli.help();
cli.parse();
