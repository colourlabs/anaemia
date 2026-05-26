#!/usr/bin/env node
import { cac } from "cac";
import { rspack } from "@rspack/core";
import { getRspackConfig } from "@anaemia/bundler";
import spawn from "cross-spawn";
import path from "node:path";
import { createJiti } from "jiti";
import fs from "node:fs";
import { ChildProcess } from "node:child_process";

const cli = cac("anaemia");

async function loadUserConfig(appRoot: string) {
  const configPath = path.resolve(appRoot, "anaemia.config.ts");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const jiti = createJiti(import.meta.url);
    // 🎯 Cast the resolution to 'any' to bypass the strict 'unknown' property block
    const module = (await jiti.import(configPath)) as any;
    return module.default || module;
  } catch (err) {
    console.error("failed parsing your anaemia.config.ts file:", err);
    return {};
  }
}

cli.command("dev", "launch local development environment").action(async () => {
  process.env.NODE_ENV = "development";
  const appRoot = process.cwd();
  
  const userConfig = await loadUserConfig(appRoot);
  const targetPort = userConfig.port || 3000;

  const [clientConfig, serverConfig] = getRspackConfig(appRoot, userConfig);
  const compiler = rspack([clientConfig, serverConfig]);

  let serverProcess: ChildProcess | null = null;

  const startServer = () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }

    serverProcess = spawn("node", [path.resolve(appRoot, "./dist/server/index.js")], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development", PORT: String(targetPort) }
    });
  };

  console.log("[anaemia compiler] warming up and analyzing assets...");

  compiler.watch({}, (err, stats) => {
    if (err) {
      console.error("compilation critical failure:", err);
      return;
    }

    if (stats?.hasErrors()) {
      console.error(
        stats.toString({
          colors: true, 
          all: false,
          errors: true,
          warnings: true
        })
      );
      console.log("compilation encountered build script errors.");
      return;
    }

    console.log("assets compiled successfully. booting server runtime...");
    startServer();
  });
});

cli.command("build", "compile production-ready optimization bundles").action(async () => {
  process.env.NODE_ENV = "production";
  const appRoot = process.cwd();
  
  const userConfig = await loadUserConfig(appRoot);
  const configs = getRspackConfig(appRoot, userConfig);
  const compiler = rspack(configs);

  console.log("[anaemia compiler] packaging production optimization bundles...");
  
  compiler.run((err, stats) => {
    if (err || stats?.hasErrors()) {
      console.error("production compilation failed!", err || stats?.toString("normal"));
      process.exit(1);
    }
    
    console.log("production bundles successfully compiled into ./dist");
    compiler.close(() => {});
  });
});

cli.help();
cli.parse();