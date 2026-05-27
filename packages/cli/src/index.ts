#!/usr/bin/env node
import { cac } from "cac";
import pc from "picocolors";
import { rspack } from "@rspack/core";
import { RspackDevServer } from "@rspack/dev-server";
import { getRspackConfig, scanRoutes } from "@anaemia/bundler";
import spawn from "cross-spawn";
import path from "node:path";
import { createJiti } from "jiti";
import fs from "node:fs";
import { ChildProcess } from "node:child_process";

const logger = {
  prefix: pc.bold(pc.red("[anaemia]")),

  info(msg: string) {
    console.log(`${this.prefix} ${pc.cyan(msg)}`);
  },
  success(msg: string) {
    console.log(`${this.prefix} ${pc.green(msg)}`);
  },
  warn(msg: string) {
    console.log(`${this.prefix} ${pc.yellow(msg)}`);
  },
  error(msg: string, detail?: any) {
    console.error(`${this.prefix} ${pc.red(msg)}`);
    if (detail) console.error(detail);
  },
  compiler(msg: string) {
    console.log(`${pc.bold(pc.magenta("[compiler]"))} ${msg}`);
  },
};

const cli = cac("anaemia");

async function loadUserConfig(appRoot: string) {
  const configPath = path.resolve(appRoot, "anaemia.config.ts");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const jiti = createJiti(import.meta.url);
    const module = (await jiti.import(configPath)) as any;
    return module.default || module;
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

  const [clientConfig, serverConfig] = getRspackConfig(appRoot, userConfig);

  const clientCompiler = rspack(clientConfig);
  const devServer = new RspackDevServer(clientConfig.devServer || {}, clientCompiler);

  let serverProcess: ChildProcess | null = null;

  const startServer = () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }

    serverProcess = spawn("node", [path.resolve(appRoot, "./dist/server/index.js")], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development", PORT: String(targetPort) },
    });
  };

  const cleanup = async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }

    if (devServer) {
      await devServer.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);

  logger.compiler("warming up and analyzing assets...");

  try {
    await devServer.start();
    logger.success(`hot reload asset infrastructure running on port ${targetPort + 1}`);
  } catch (err) {
    logger.error("failed to start client asset dev server:", err);
    process.exit(1);
  }

  const serverCompiler = rspack(serverConfig);

  serverCompiler.watch({}, (err, stats) => {
    if (err) {
      logger.error("server compilation critical failure:", err);
      return;
    }

    if (stats?.hasErrors()) {
      console.error(
        stats.toString({
          colors: true,
          all: false,
          errors: true,
          warnings: true,
        })
      );
      logger.error("server compilation encountered build script errors.");
      return;
    }

    logger.info(`server bundles updated. booting runtime on http://localhost:${targetPort}`);
    startServer();
  });
});

cli.command("build", "compile production-ready optimization bundles").action(async () => {
  process.env.NODE_ENV = "production";
  const appRoot = process.cwd();

  const userConfig = await loadUserConfig(appRoot);
  const configs = getRspackConfig(appRoot, userConfig);
  const compiler = rspack(configs);

  logger.compiler("packaging production optimization bundles...");

  compiler.run((err, stats) => {
    if (err || stats?.hasErrors()) {
      logger.error("production compilation failed!", err || stats?.toString("normal"));
      process.exit(1);
    }

    logger.success("production bundles successfully compiled into ./dist");
    compiler.close(() => {});
  });
});

cli.command("routes", "print the scanned route manifest").action(async () => {
  const appRoot = process.cwd();
  const routes = scanRoutes(appRoot);

  logger.info("scanned route architecture:");
  console.table(
    routes.map((r) => ({
      pattern: r.urlPattern,
      chunk: r.chunkName,
      layouts: r.layouts.length,
      params: r.params.join(", ") || "—",
      type: r.type,
    }))
  );
});

cli.help();
cli.parse();
