import type { CAC } from "cac";
import { rspack } from "@rspack/core";
import { RspackDevServer } from "@rspack/dev-server";
import { getRspackConfig } from "@anaemia/bundler";
import spawn from "cross-spawn";
import path from "node:path";
import http from "node:http";
import { WebSocketServer } from "ws";
import { WebSocket as NodeWS } from "ws";
import { loadUserConfig } from "../utils/config.js";
import logger from "../utils/logger.js";
import { ChildProcess } from "node:child_process";

export function register(cli: CAC) {
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
        serverProcess = spawn("node", ["--enable-source-maps", path.resolve(appRoot, "./dist/server/index.js")], {
          stdio: "inherit",
          env: {
            ...process.env,
            NODE_ENV: "development",
            PORT: String(targetPort),
            RSPACK_DEV_PORT: String(targetPort + 1),
          },
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
}
