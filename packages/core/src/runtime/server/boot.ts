import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import type { RuntimeEnv } from "./types.js";

export function serveServer(app: Hono, env: RuntimeEnv) {
  serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`[anaemia framework] server live at http://localhost:${info.port}`);
  });
}
