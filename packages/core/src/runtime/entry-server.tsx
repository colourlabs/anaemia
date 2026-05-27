import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { renderToStringAsync, generateHydrationScript } from "solid-js/web";
import { Router } from "@solidjs/router";
import { ssrStorage, serverFunctionsRegistry } from "./context.js";
import fs from "node:fs";
import path from "node:path";

// @ts-ignore - mapped by Rspack
import App from "anaemia-user-app";

// @ts-ignore - mapped by Rspack
import { registerServerRoutes } from "__anaemia_server_routes__";

const port = Number(process.env.PORT) || 3000;
const isDev = process.env.NODE_ENV !== "production";
const devPort = port + 1;
const devServerUrl = `http://localhost:${devPort}`;

const app = new Hono();

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
}

app.post("/_rpc", async (c) => {
  const functionId = c.req.query("id");

  if (!functionId || !serverFunctionsRegistry.has(functionId)) {
    return c.json({ error: "RPC function not found" }, 404);
  }

  const serverFn = serverFunctionsRegistry.get(functionId)!;
  const argumentsArray = await c.req.json();

  try {
    const result = await serverFn(...argumentsArray);
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
        memoizedManifest = { routes: [], chunks: {} };
      }
    } catch (err) {
      console.error("[anaemia engine sync error - manifest read failed]:", err);
      memoizedManifest = { routes: [], chunks: {} };
    }
  } else {
    try {
      if (fs.existsSync(templatePath)) memoizedHtmlTemplate = fs.readFileSync(templatePath, "utf-8");
      if (fs.existsSync(manifestPath)) memoizedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      console.warn("build assets not fully initialized during bootstrapping cycle.");
    }
  }
};

loadManifestAndTemplate();

const normalizeAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  return url.startsWith("/") ? url : `/${url}`;
};

app.get("*", async (c) => {
  if (isDev) {
    await loadManifestAndTemplate();
  }

  let template = memoizedHtmlTemplate;
  let manifest = memoizedManifest;

  if (!template || !manifest) {
    return c.text("anaemia engine error: build distribution assets are missing or the Rspack dev server hasn't finished compiling yet.", 500);
  }

  const reqPath = c.req.path;
  let activeChunk = "client";

  if (manifest.routes) {
    const matchedRoute = manifest.routes.find((route: any) => {
      const regexPattern = route.urlPattern.replace(/:[^\s/]+/g, "([^/]+)");
      return new RegExp(`^${regexPattern}$`).test(reqPath);
    });
    if (matchedRoute) {
      activeChunk = matchedRoute.chunkName;
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

    if (routeBundle?.css) {
      assetStyles += `<link rel="stylesheet" href="${normalizeAssetUrl(routeBundle.css)}">\n`;
    }
  }

  const store = new Map<string, any>();

  const htmlPayload = await ssrStorage.run(store, async () => {
    return renderToStringAsync(() => (
      <Router url={reqPath}>
        <App />
      </Router>
    ));
  });

  const hydrationScript = generateHydrationScript();
  const serializedData = JSON.stringify(Object.fromEntries(store)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const dataScript = `<script id="__ANAEMIA_DATA__" type="application/json">${serializedData}</script>\n`;

  const entryTagRegex = /(<([a-zA-Z0-9\-]+)[^>]*anaemia-entry[^>]*>)(.*?)(<\/\2>)/is;
  const sanitizedPayload = htmlPayload.trim();

  let completeHtmlOutput = entryTagRegex.test(template) ? template.replace(entryTagRegex, `$1${sanitizedPayload}$4`) : template.replace("</body>", `<div anaemia-entry>${sanitizedPayload}</div></body>`);

  if (completeHtmlOutput.includes("</head>")) {
    completeHtmlOutput = completeHtmlOutput.replace("</head>", `${assetStyles}${dataScript}</head>`);
  } else {
    completeHtmlOutput = completeHtmlOutput.replace("</body>", `${dataScript}</body>`);
  }

  completeHtmlOutput = completeHtmlOutput.replace("<head>", `<head>${hydrationScript}`);
  completeHtmlOutput = completeHtmlOutput.replace("</body>", `${assetScripts}</body>`);

  return c.html(completeHtmlOutput);
});

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[anaemia framework] server streaming live at http://localhost:${info.port}`);
  }
);

export default app;
