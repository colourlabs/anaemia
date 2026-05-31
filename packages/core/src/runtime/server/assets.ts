import type { Context, Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { RuntimeEnv } from "./types.js";

function setNoCacheHeaders(c: Context) {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
}

async function proxyDevAsset(c: Context, targetUrl: string, notFoundMessage: string, failureMessage: string) {
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) return c.text(notFoundMessage, 404);

    const contentType = response.headers.get("content-type");
    if (contentType) c.header("content-type", contentType);

    setNoCacheHeaders(c);

    return c.body(await response.arrayBuffer());
  } catch {
    return c.text(failureMessage, 500);
  }
}

export function registerAssetRoutes(app: Hono, env: RuntimeEnv) {
  if (env.isDev) {
    app.get("/assets/*", (c) =>
      proxyDevAsset(
        c,
        `${env.devServerUrl}${c.req.path}`,
        "asset not found in Rspack memory",
        "failed to connect to Rspack dev server asset bridge",
      ),
    );
  } else {
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.ok) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    });

    app.use(
      "/assets/*",
      serveStatic({
        root: env.clientDistPath,
      }),
    );
  }

  app.use(async (c, next) => {
    const requestPath = c.req.path;
    if (env.isDev && requestPath.includes(".hot-update.")) {
      return proxyDevAsset(
        c,
        `${env.devServerUrl}${requestPath}`,
        "hot update not found",
        "failed to fetch hot update",
      );
    }

    await next();
  });
}

export function setDevResponseCacheHeaders(c: Context, env: RuntimeEnv) {
  if (!env.isDev) return;
  setNoCacheHeaders(c);
}
