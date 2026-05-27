import { Hono } from "hono";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import { renderToStringAsync, generateHydrationScript } from "solid-js/web";
import { Router } from "@solidjs/router";
import { ssrStorage, serverFunctionsRegistry } from "./context.js";
import fs from "node:fs";
import path from "path";
import { WebSocket as NodeWS, WebSocketServer } from "ws";
import type { StatusCode, RedirectStatusCode } from "hono/utils/http-status";

// @ts-ignore - mapped by Rspack
import App from "anaemia-user-app";

// @ts-ignore - mapped by Rspack
import { serverLoaderRegistry, serverGuardRegistry } from "anaemia-user-app";

// @ts-ignore - mapped by Rspack
import { registerServerRoutes } from "__anaemia_server_routes__";

const port = Number(process.env.PORT) || 3000;
const isDev = process.env.NODE_ENV !== "production";

const devPort = Number(process.env.RSPACK_DEV_PORT) || 4445;
const devServerUrl = `http://localhost:${devPort}`;

let sortedRoutes: any[] | null = null;

const ENTRY_TAG_REGEX = /(<([a-zA-Z0-9\-]+)[^>]*anaemia-entry[^>]*>)(.*?)(<\/\2>)/is;

const app = new Hono();

app.use("*", compress());

app.use("*", async (c, next) => {
  const store = new Map<string, any>();
  store.set("honoContext", c);
  return await ssrStorage.run(store, next);
});

if (isDev) {
  app.get(
    "/_anaemia_hmr",
    upgradeWebSocket(() => {
      let rspackSocket: NodeWS | null = null;
    
      const closeRspack = () => {
        if (!rspackSocket) return;
        if (rspackSocket.readyState === NodeWS.OPEN || rspackSocket.readyState === NodeWS.CONNECTING) {
          rspackSocket.once("open", () => rspackSocket?.close());
          if (rspackSocket.readyState === NodeWS.OPEN) rspackSocket.close();
        }
        rspackSocket = null;
      };
    
      return {
        onOpen(event, ws) {
          rspackSocket = new NodeWS(`ws://localhost:${devPort}/rspack-hmr`);
    
          rspackSocket.on("error", (err) => {
            console.warn("[anaemia hmr] rspack socket error:", err.message);
            closeRspack();
          });
    
          rspackSocket.on("message", (data) => {
            const flattened = Array.isArray(data) ? Buffer.concat(data) : data;
            if (Buffer.isBuffer(flattened)) ws.send(flattened.toString("utf-8"));
            else ws.send(String(flattened));
          });
        },
        onMessage(event, ws) {
          if (rspackSocket?.readyState === NodeWS.OPEN) rspackSocket.send(event.data);
        },
        onClose() {
          closeRspack();
        },
      };
    })
  );
}

if (isDev) {
  app.get("/assets/*", async (c) => {
    const targetUrl = `${devServerUrl}${c.req.path}`;
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) return c.text("asset not found in Rspack memory", 404);

      const contentType = response.headers.get("content-type");
      if (contentType) c.header("content-type", contentType);

      return c.body(await response.arrayBuffer());
    } catch (err) {
      return c.text("failed to connect to Rspack dev server asset bridge", 500);
    }
  });
} else {
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  });
  
  app.use("/assets/*", serveStatic({
    root: path.relative(process.cwd(), "./dist/client"),
  }));
}

app.post("/_rpc", async (c) => {
  const functionId = c.req.query("id");
  if (!functionId || !serverFunctionsRegistry.has(functionId)) {
    return c.json({ error: "RPC function not found" }, 404);
  }

  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (contentLength > 512_000) {
    return c.json({ error: "Payload too large" }, 413);
  }

  let argumentsArray: unknown[];
  try {
    const body = await c.req.json();
    if (!Array.isArray(body)) throw new Error("Expected array");
    argumentsArray = body;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    const result = await serverFunctionsRegistry.get(functionId)!(...argumentsArray);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

registerServerRoutes(app);

let memoizedHtmlTemplate = "";
let memoizedManifest: any = null;

const templatePath = path.resolve(process.cwd(), "./dist/client/index.html");
const manifestPath = path.resolve(process.cwd(), "./dist/route-manifest.json");

const loadManifestAndTemplate = async () => {
  if (isDev) {
    try {
      memoizedHtmlTemplate = await fetch(`${devServerUrl}/index.html`).then((r) => {
        if (!r.ok) throw new Error(`index.html fetch failed: ${r.status}`);
        return r.text();
      });
    } catch (err) {
      console.error("[anaemia engine sync error - HTML fetch failed]:", err);
      memoizedHtmlTemplate = "";
    }

    try {
      if (fs.existsSync(manifestPath)) {
        memoizedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } else {
        memoizedManifest = { routes: [], chunks: {}, errors: {} };
      }
    } catch (err) {
      console.error("[anaemia engine sync error - manifest read failed]:", err);
      memoizedManifest = { routes: [], chunks: {}, errors: {} };
    }
  } else {
    try {
      if (fs.existsSync(templatePath)) memoizedHtmlTemplate = fs.readFileSync(templatePath, "utf-8");
      if (fs.existsSync(manifestPath)) memoizedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      console.warn("build assets not fully initialized during bootstrapping cycle.");
    }
  }

  sortedRoutes = null;
};

const normalizeAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return url.startsWith("/") ? url : `/${url}`;
};

type RouteMatch = {
  activeChunk: string;
  targetPattern: string;
  statusCode: StatusCode;
  params: Record<string, string>;
};

type GuardFn = (ctx: { params: Record<string, string>; request: Request; url: string }) => 
  | void | undefined
  | { redirect: string; status?: 301 | 302 | 307 | 308 }
  | { status: number; body?: string }
  | Promise<void | undefined | { redirect: string; status?: number } | { status: number; body?: string }>;

async function runGuards(
  pattern: string,
  ctx: { params: Record<string, string>; request: Request; url: string }
) {
  const chain: (() => Promise<GuardFn[]>)[] = serverGuardRegistry.get(pattern) ?? [];
  for (const loadGuards of chain) {
    const guards: GuardFn[] = await loadGuards();
    for (const guard of guards) {
      const result = await guard(ctx);
      if (result && ("redirect" in result || "status" in result)) return result;
    }
  }
  return null;
}

function matchRoute(manifest: any, reqPath: string): RouteMatch {
  if (!sortedRoutes) {
    sortedRoutes = [...manifest.routes].sort((a: any, b: any) => {
      const score = (pattern: string) => {
        const segments = pattern.split("/").filter(Boolean);
        return segments.reduce((acc, s) => {
          if (s.startsWith(":")) return acc - 1;
          if (s === "*" || s.startsWith("*")) return acc - 2;
          return acc;
        }, segments.length * 10);
      };
      return score(b.urlPattern) - score(a.urlPattern);
    });
  }

  for (const route of sortedRoutes) {
    const regexStr = route.urlPattern
      .replace(/:([a-zA-Z0-9_-]+)/g, "(?<$1>[^/]+)")
      .replace(/\*([a-zA-Z0-9_-]*)/g, "(?<catchall>.*)");

    const match = new RegExp(`^${regexStr}$`).exec(reqPath);
    if (match) {
      return {
        activeChunk: route.chunkName,
        targetPattern: route.urlPattern,
        statusCode: 200,
        params: match.groups ? { ...match.groups } : {},
      };
    }
  }

  return {
    activeChunk: "route-404",
    targetPattern: manifest.errors?.["404"] || "",
    statusCode: 404,
    params: {},
  };
}

app.get("*", async (c) => {
  if (isDev) await loadManifestAndTemplate();

  let template = memoizedHtmlTemplate;
  let manifest = memoizedManifest;

  if (!template || !manifest) {
    return c.text("anaemia engine error: build distribution assets are missing or the Rspack dev server hasn't finished compiling yet.", 500);
  }

  const reqPath = c.req.path;
  const { activeChunk, targetPattern, statusCode: matchedStatus, params } = matchRoute(manifest, reqPath);
  let statusCode: StatusCode = matchedStatus;
  const loaderArgs = { params, request: c.req.raw };

  const store = ssrStorage.getStore();
  let htmlPayload = "";

  if (targetPattern) {
    try {
      const guardResult = await runGuards(targetPattern, {
        params,
        request: c.req.raw,
        url: reqPath,
      });

      if (guardResult) {
        if ("redirect" in guardResult) {
          return c.redirect(guardResult.redirect, (guardResult.status ?? 302) as RedirectStatusCode);
        }
        if ("status" in guardResult) {
          statusCode = guardResult.status as StatusCode;
        }
      }
    } catch (err) {
      console.error("[anaemia] guard threw unexpectedly:", err);
      return c.text("Internal Server Error", 500);
    }
  }

  try {
    if (targetPattern && store) {
      const executableLoader = serverLoaderRegistry.get(targetPattern);
      if (executableLoader) {
        const initialLoaderData = await executableLoader(loaderArgs);
        store.set("__LOADER_DATA__", initialLoaderData);
      }
    }

    htmlPayload = await renderToStringAsync(() => (
      <Router url={reqPath}>
        <App />
      </Router>
    ));
  } catch (err: any) {
    statusCode = 500;
    console.error("[anaemia framework] runtime execution crash handled:", err);

    const error500Pattern = manifest.errors?.["500"];
    const error500Loader = error500Pattern ? serverLoaderRegistry.get(error500Pattern) : null;

    if (error500Loader && store) {
      const runtimeContextPayload = {
        message: err.message,
        stack: isDev ? err.stack : undefined,
      };
      store.set("__LOADER_DATA__", runtimeContextPayload);

      try {
        htmlPayload = await renderToStringAsync(() => (
          <Router url={error500Pattern}><App /></Router>
        ));
      } catch {
        htmlPayload = `<h1>500 Internal Server Error</h1>`;
      }
    } else {
      htmlPayload = `<h1>500 Internal Server Error</h1><pre>${isDev ? err.stack : ""}</pre>`;
    }
  }

  let assetScripts = "";
  let assetStyles = "";

  if (manifest.chunks) {
    const coreBundle = manifest.chunks["client"];
    const routeBundle = manifest.chunks[activeChunk];

    if (coreBundle?.js) {
      assetScripts += `<script type="module" src="${normalizeAssetUrl(coreBundle.js)}"></script>\n`;
    }
    if (coreBundle?.css) {
      assetStyles += `<link rel="stylesheet" href="${normalizeAssetUrl(coreBundle.css)}">\n`;
    }
    if (routeBundle?.css && activeChunk !== "client") {
      assetStyles += `<link rel="stylesheet" href="${normalizeAssetUrl(routeBundle.css)}">\n`;
    }
  }

  const hydrationScript = generateHydrationScript();

  const serializedMap = store ? Object.fromEntries(store) : {};
  delete serializedMap.honoContext;

  const serializedData = JSON.stringify(serializedMap).replace(/&/g, "\\u0026").replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\//g, "\\u002f");
  const dataScript = `<script id="__ANAEMIA_DATA__" type="application/json">${serializedData}</script>\n`;

  const sanitizedPayload = htmlPayload.trim();

  let completeHtmlOutput = ENTRY_TAG_REGEX.test(template) ? template.replace(ENTRY_TAG_REGEX, (_, open, _tag, _inner, close) => `${open}${sanitizedPayload}${close}`) : template.replace("</body>", () => `<div anaemia-entry>${sanitizedPayload}</div></body>`);

  if (completeHtmlOutput.includes("</head>")) {
    completeHtmlOutput = completeHtmlOutput.replace("</head>", `${assetStyles}${dataScript}</head>`);
  } else {
    completeHtmlOutput = completeHtmlOutput.replace("</body>", `${dataScript}</body>`);
  }

  completeHtmlOutput = completeHtmlOutput.replace("<head>", `<head>${hydrationScript}`);
  completeHtmlOutput = completeHtmlOutput.replace("</body>", `${assetScripts}</body>`);

  c.status(statusCode);
  return c.html(completeHtmlOutput);
});

loadManifestAndTemplate().then(() => {
  if (isDev) {
    const wss = new WebSocketServer({ noServer: true });
    serve({ fetch: app.fetch, websocket: { server: wss }, port }, (info) => {
      console.log(`[anaemia framework] server live at http://localhost:${info.port}`);
    });
  } else {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`[anaemia framework] server live at http://localhost:${info.port}`);
    });
  }
}).catch((err) => {
  console.error("[anaemia] failed to initialize:", err);
  process.exit(1);
});

export default app;
