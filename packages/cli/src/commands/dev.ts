import type { CAC } from "cac";
import { rspack } from "@rspack/core";
import type { Watching } from "@rspack/core";
import { RspackDevServer } from "@rspack/dev-server";
import { getRspackConfig } from "@anaemia/bundler";
import spawn from "cross-spawn";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import { WebSocket as NodeWS } from "ws";
import { loadUserConfig } from "../utils/config.js";
import logger from "../utils/logger.js";
import type { ChildProcess } from "node:child_process";
import { flattenWsMessage } from "../utils/flatten-ws-message.js";

const CONFIG_FILES = ["anaemia.config.ts", "anaemia.config.js", "anaemia.config.cjs", "anaemia.config.mjs"];
const OUTPUT_DIR = ".anaemia";

export function register(cli: CAC) {
  cli.command("dev", "launch local development environment").action(async () => {
    process.env.NODE_ENV = "development";
    const appRoot = process.cwd();

    const userConfig = await loadUserConfig(appRoot);
    const targetPort = userConfig.port || 3000;

    const [clientConfig] = await getRspackConfig(appRoot, userConfig);

    const clientCompiler = rspack(clientConfig);
    const devServer = new RspackDevServer(clientConfig.devServer || {}, clientCompiler);

    const bridgeServer = http.createServer();
    const wss = new WebSocketServer({ server: bridgeServer });

    wss.on("connection", (clientWs) => {
      const rspackSocket = new NodeWS(`ws://localhost:${targetPort + 1}/ws`);

      rspackSocket.on("message", (data) => {
        clientWs.send(flattenWsMessage(data));
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
    let serverWatcher: Watching | null = null;
    let isRestarting = false;
    let startServerTimer: ReturnType<typeof setTimeout> | null = null;

    const startServer = () => {
      if (startServerTimer) {
        clearTimeout(startServerTimer);
        startServerTimer = null;
      }

      startServerTimer = setTimeout(() => {
        startServerTimer = null;

        if (serverProcess) {
          serverProcess.kill("SIGTERM");
          serverProcess = null;
        }

        logger.info(`server bundles updated. booting runtime on http://localhost:${targetPort}`);

        serverProcess = spawn(
          "node",
          ["--enable-source-maps", path.resolve(appRoot, `./${OUTPUT_DIR}/server/index.js`)],
          {
            stdio: "inherit",
            env: {
              ...process.env,
              NODE_ENV: "development",
              PORT: String(targetPort),
              RSPACK_DEV_PORT: String(targetPort + 1),
            },
          },
        );
      }, 200);
    };

    const stopCompilers = () =>
      new Promise<void>((resolve) => {
        if (serverWatcher) {
          serverWatcher.close(() => {
            serverWatcher = null;
            resolve();
          });
        } else {
          resolve();
        }
      });

    const startCompilers = async () => {
      const [, freshServerConfig] = await getRspackConfig(appRoot, await loadUserConfig(appRoot));
      const compiler = rspack({
        ...freshServerConfig,
        stats: "none",
        infrastructureLogging: { level: "none" },
      });
      let lastStart = 0;

      serverWatcher = compiler.watch({}, (err, stats) => {
        if (err) {
          logger.error("server compilation critical failure:", err);
          return;
        }
        if (stats?.hasErrors()) {
          const info = stats.toJson({ errors: true, warnings: false });
          for (const e of info.errors ?? []) {
            logger.error(`${e.moduleName ?? e.moduleIdentifier ?? "unknown"}\n  ${e.message}`);
          }
          logger.error("server compilation encountered build script errors.");
          return;
        }
        const now = Date.now();
        if (now - lastStart < 500) return;
        lastStart = now;
        startServer();
      });
    };

    const restart = async (reason: string) => {
      if (isRestarting) return;
      isRestarting = true;
      logger.info(`restarting compilers — ${reason}`);

      if (serverProcess) {
        serverProcess.kill("SIGTERM");
        serverProcess = null;
      }

      await stopCompilers();
      await startCompilers();
      isRestarting = false;
    };

    const configWatchers: fs.FSWatcher[] = [];
    for (const file of CONFIG_FILES) {
      const filePath = path.resolve(appRoot, file);
      if (!fs.existsSync(filePath)) continue;

      const watcher = fs.watch(filePath, (event) => {
        if (event === "change") {
          void restart(`${file} changed`);
        }
      });
      configWatchers.push(watcher);
    }

    const outputDir = path.resolve(appRoot, OUTPUT_DIR);
    const deletionPoller = setInterval(() => {
      if (!fs.existsSync(outputDir)) {
        logger.warn(`${OUTPUT_DIR}/ was deleted - triggering rebuild`);
        void restart(`${OUTPUT_DIR}/ deleted`);
      }
    }, 1000);

    const cleanup = async () => {
      for (const watcher of configWatchers) {
        watcher.close();
      }

      clearInterval(deletionPoller);
      if (serverProcess) {
        serverProcess.kill("SIGTERM");
        serverProcess = null;
      }
      bridgeServer.close();
      await stopCompilers();
      await devServer.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void cleanup());
    process.on("SIGTERM", () => void cleanup());

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

    await startCompilers();
  });
}
