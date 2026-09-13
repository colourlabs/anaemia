import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import { getLogger } from "./logger.js";
import type { RuntimeEnv } from "./types.js";

export function serveServer(app: Hono, env: RuntimeEnv) {
  const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
    getLogger().info(`server live at http://localhost:${info.port}`);
  });

  // graceful shutdown: @hono/node-server does not install its own handlers, so
  // a SIGTERM/SIGINT would otherwise kill the process mid-flight. closing the
  // listener and letting the event loop drain exits through the normal runtime
  // teardown path, which flushes V8 CPU profiles and closes keep-alive sockets.
  const shutdown = (signal: NodeJS.Signals) => {
    getLogger().info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    if ("closeIdleConnections" in server) server.closeIdleConnections();
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  return server as ServerType;
}
