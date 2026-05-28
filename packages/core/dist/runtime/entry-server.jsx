import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import { renderToStringAsync, generateHydrationScript } from "solid-js/web";
import { Router } from "@solidjs/router";
import { ssrStorage, serverFunctionsRegistry } from "./context.js";
import fs from "node:fs";
import path from "path";
// @ts-expect-error - resolved by Rspack
import App from "anaemia-user-app";
// @ts-expect-error - resolved by Rspack
import { preloadActiveClientRoute, serverLoaderRegistry, serverGuardRegistry } from "anaemia-user-app";
// @ts-expect-error - resolved by Rspack
import { registerServerRoutes } from "__anaemia_server_routes__";
const port = Number(process.env.PORT) || 3000;
const isDev = process.env.NODE_ENV !== "production";
const devPort = Number(process.env.RSPACK_DEV_PORT) || 4445;
const devServerUrl = `http://localhost:${devPort}`;
let sortedRoutes = null;
const ENTRY_TAG_REGEX = /(<([a-zA-Z0-9-]+)[^>]*anaemia-entry[^>]*>)(.*?)(<\/\2>)/is;
const app = new Hono();
app.use("*", compress());
app.use("*", async (c, next) => {
    const store = new Map();
    store.set("honoContext", c);
    return await ssrStorage.run(store, next);
});
if (isDev) {
    const devAssetProxy = async (c) => {
        const targetUrl = `${devServerUrl}${c.req.path}`;
        try {
            const response = await fetch(targetUrl);
            if (!response.ok)
                return c.text("asset not found in Rspack memory", 404);
            const contentType = response.headers.get("content-type");
            if (contentType)
                c.header("content-type", contentType);
            c.header("Cache-Control", "no-cache, no-store, must-revalidate");
            c.header("Pragma", "no-cache");
            c.header("Expires", "0");
            return c.body(await response.arrayBuffer());
        }
        catch {
            return c.text("failed to connect to Rspack dev server asset bridge", 500);
        }
    };
    app.get("/assets/*", devAssetProxy);
}
else {
    app.use("/assets/*", async (c, next) => {
        await next();
        if (c.res.ok)
            c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("/assets/*", serveStatic({
        root: path.resolve(process.cwd(), "./dist/client"),
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
    let argumentsArray;
    try {
        const body = await c.req.json();
        if (!Array.isArray(body))
            throw new Error("Expected array");
        argumentsArray = body;
    }
    catch {
        return c.json({ error: "Invalid request body" }, 400);
    }
    try {
        const result = await serverFunctionsRegistry.get(functionId)(...argumentsArray);
        return c.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";
        return c.json({ error: message }, 500);
    }
});
app.use(async (c, next) => {
    const p = c.req.path;
    if (isDev && p.includes(".hot-update.")) {
        const targetUrl = `${devServerUrl}${p}`;
        try {
            const response = await fetch(targetUrl);
            if (!response.ok)
                return c.text("hot update not found", 404);
            const contentType = response.headers.get("content-type");
            if (contentType)
                c.header("content-type", contentType);
            c.header("Cache-Control", "no-cache, no-store, must-revalidate");
            return c.body(await response.arrayBuffer());
        }
        catch {
            return c.text("failed to fetch hot update", 500);
        }
    }
    await next();
});
registerServerRoutes(app);
let memoizedHtmlTemplate = "";
let memoizedManifest = null;
const templatePath = path.resolve(process.cwd(), "./dist/client/index.html");
const manifestPath = path.resolve(process.cwd(), "./dist/route-manifest.json");
const loadManifestAndTemplate = async () => {
    if (isDev) {
        try {
            memoizedHtmlTemplate = await fetch(`${devServerUrl}/index.html`).then((r) => {
                if (!r.ok)
                    throw new Error(`index.html fetch failed: ${r.status}`);
                return r.text();
            });
        }
        catch (err) {
            console.error("[anaemia engine sync error - HTML fetch failed]:", err);
            memoizedHtmlTemplate = "";
        }
        try {
            if (fs.existsSync(manifestPath)) {
                memoizedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            }
            else {
                memoizedManifest = { routes: [], chunks: {}, errors: {} };
            }
        }
        catch (err) {
            console.error("[anaemia engine sync error - manifest read failed]:", err);
            memoizedManifest = { routes: [], chunks: {}, errors: {} };
        }
    }
    else {
        try {
            if (fs.existsSync(templatePath))
                memoizedHtmlTemplate = fs.readFileSync(templatePath, "utf-8");
            if (fs.existsSync(manifestPath))
                memoizedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        }
        catch {
            console.warn("build assets not fully initialized during bootstrapping cycle.");
        }
    }
    sortedRoutes = null;
};
const normalizeAssetUrl = (url) => {
    if (!url || typeof url !== "string")
        return "";
    if (url.startsWith("http://") || url.startsWith("https://"))
        return url;
    return url.startsWith("/") ? url : `/${url}`;
};
async function runGuards(pattern, ctx) {
    const chain = serverGuardRegistry.get(pattern) ?? [];
    for (const loadGuards of chain) {
        const guards = await loadGuards();
        for (const guard of guards) {
            const result = await guard(ctx);
            if (result && ("redirect" in result || "status" in result))
                return result;
        }
    }
    return null;
}
function matchRoute(manifest, reqPath) {
    if (!sortedRoutes) {
        sortedRoutes = [...manifest.routes].sort((a, b) => {
            const score = (pattern) => {
                const segments = pattern.split("/").filter(Boolean);
                return segments.reduce((acc, s) => {
                    if (s.startsWith(":"))
                        return acc - 1;
                    if (s === "*" || s.startsWith("*"))
                        return acc - 2;
                    return acc;
                }, segments.length * 10);
            };
            return score(b.urlPattern) - score(a.urlPattern);
        });
    }
    for (const route of sortedRoutes) {
        const regexStr = route.urlPattern.replace(/:([a-zA-Z0-9_-]+)/g, "(?<$1>[^/]+)").replace(/\*([a-zA-Z0-9_-]*)/g, "(?<catchall>.*)");
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
    if (isDev)
        await loadManifestAndTemplate();
    let template = memoizedHtmlTemplate;
    let manifest = memoizedManifest;
    if (!template || !manifest) {
        return c.text("anaemia engine error: build assets are missing", 500);
    }
    const reqPath = c.req.path;
    const { activeChunk, targetPattern, statusCode: matchedStatus, params } = matchRoute(manifest, reqPath);
    let statusCode = matchedStatus;
    const loaderArgs = { params, request: c.req.raw };
    const store = ssrStorage.getStore() || new Map();
    let htmlPayload;
    if (targetPattern) {
        try {
            const guardResult = await runGuards(targetPattern, { params, request: c.req.raw, url: reqPath });
            if (guardResult) {
                if ("redirect" in guardResult)
                    return c.redirect(guardResult.redirect, (guardResult.status ?? 302));
                if ("status" in guardResult)
                    statusCode = guardResult.status;
            }
        }
        catch (err) {
            console.error("[anaemia] guard threw unexpectedly:", err);
            return c.text("Internal Server Error", 500);
        }
    }
    try {
        htmlPayload = await ssrStorage.run(store, async () => {
            if (targetPattern) {
                const executableLoader = serverLoaderRegistry.get(targetPattern);
                if (executableLoader) {
                    const initialLoaderData = await executableLoader(loaderArgs);
                    store.set("__LOADER_DATA__", initialLoaderData);
                }
            }
            await preloadActiveClientRoute(reqPath);
            return await renderToStringAsync(() => (<Router url={reqPath}>
          <App />
        </Router>));
        });
    }
    catch (err) {
        statusCode = 500;
        console.error("[anaemia framework] runtime execution crash handled:", err);
        const error500Pattern = manifest.errors?.["500"];
        const error500Loader = error500Pattern ? serverLoaderRegistry.get(error500Pattern) : null;
        if (error500Loader) {
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            const runtimeContextPayload = { message, stack: isDev ? stack : undefined };
            store.set("__LOADER_DATA__", runtimeContextPayload);
            try {
                htmlPayload = await ssrStorage.run(store, async () => {
                    return await renderToStringAsync(() => (<Router url={error500Pattern}>
              <App />
            </Router>));
                });
            }
            catch {
                htmlPayload = `<h1>500 Internal Server Error</h1>`;
            }
        }
        else {
            const stack = err instanceof Error ? err.stack : String(err);
            htmlPayload = `<h1>500 Internal Server Error</h1><pre>${isDev ? stack : ""}</pre>`;
        }
    }
    let assetScripts = "";
    let assetStyles = "";
    if (manifest.chunks) {
        const processChunkAssets = (chunk) => {
            if (!chunk)
                return;
            if (chunk.js) {
                const jsSpecs = Array.isArray(chunk.js) ? chunk.js : [chunk.js];
                jsSpecs.forEach((jsFile) => {
                    assetScripts += `<script type="module" src="${normalizeAssetUrl(jsFile)}"></script>\n`;
                });
            }
            if (chunk.css) {
                const cssSpecs = Array.isArray(chunk.css) ? chunk.css : [chunk.css];
                cssSpecs.forEach((cssFile) => {
                    assetStyles += `<link rel="stylesheet" href="${normalizeAssetUrl(cssFile)}">\n`;
                });
            }
        };
        processChunkAssets(manifest.chunks["client"]);
        if (manifest.chunks["commons"])
            processChunkAssets(manifest.chunks["commons"]);
        if (manifest.chunks["vendors"])
            processChunkAssets(manifest.chunks["vendors"]);
        if (activeChunk && activeChunk !== "client")
            processChunkAssets(manifest.chunks[activeChunk]);
    }
    const hydrationScript = generateHydrationScript();
    const rawStorePayload = Object.fromEntries(store);
    const finalHydrationStatePayload = {
        __LOADER_DATA__: rawStorePayload.__LOADER_DATA__ || {},
        __SERVER_FUNCTION_DATA__: rawStorePayload.__SERVER_FUNCTION_DATA__ || {},
    };
    const serializedData = JSON.stringify(finalHydrationStatePayload).replace(/&/g, "\\u0026").replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\//g, "\\u002f");
    const dataScript = `<script id="__ANAEMIA_DATA__" type="application/json">${serializedData}</script>\n`;
    const devNoCacheTag = isDev ? `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">\n` : "";
    const combinedHeadInjections = `${devNoCacheTag}${assetStyles}${dataScript}${hydrationScript}`;
    const sanitizedPayload = htmlPayload.trim();
    let completeHtmlOutput = ENTRY_TAG_REGEX.test(template) ? template.replace(ENTRY_TAG_REGEX, (_, open, _tag, _inner, close) => `${open}${sanitizedPayload}${close}`) : template.replace("</body>", () => `<div anaemia-entry>${sanitizedPayload}</div></body>`);
    completeHtmlOutput = completeHtmlOutput.replace("<head>", `<head>${combinedHeadInjections}`);
    completeHtmlOutput = completeHtmlOutput.replace("</body>", `${assetScripts}</body>`);
    if (isDev) {
        c.header("Cache-Control", "no-cache, no-store, must-revalidate");
        c.header("Pragma", "no-cache");
        c.header("Expires", "0");
    }
    c.status(statusCode);
    return c.html(completeHtmlOutput);
});
loadManifestAndTemplate()
    .then(() => {
    serve({ fetch: app.fetch, port }, (info) => {
        console.log(`[anaemia framework] server live at http://localhost:${info.port}`);
    });
})
    .catch((err) => {
    console.error("[anaemia] failed to initialize:", err);
    process.exit(1);
});
export default app;
