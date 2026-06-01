import { Router } from "@solidjs/router";
import type { Component } from "solid-js";
import type { Context } from "hono";
import type { ContentfulStatusCode, RedirectStatusCode, StatusCode } from "hono/utils/http-status";
import { renderToStream } from "solid-js/web";
import { ssrStorage } from "../context.js";
import { LOADER_DATA_KEY } from "../shared/constants.js";
import { setDevResponseCacheHeaders } from "./assets.js";
import { runGuards, type GuardFn } from "./guards.js";
import { createDevNoCacheHeadTags, createHtmlStreamShell, getRouteAssetTags } from "./html.js";
import { createHydrationDataScript, createHydrationRuntimeScript } from "./hydration.js";
import { matchRoute } from "./route-match.js";
import type { RouteManifest, RuntimeEnv } from "./types.js";
import type { ManifestSnapshot } from "./manifest.js";

const staticCache = new Map<string, string>();

type ServerLoader = (args: { params: Record<string, string>; request: Request }) => unknown | Promise<unknown>;

type RenderRequestOptions = {
  App: Component;
  env: RuntimeEnv;
  preloadActiveClientRoute: (path: string) => unknown | Promise<unknown>;
  serverLoaderRegistry: Map<string, ServerLoader>;
  serverGuardRegistry: Map<string, (() => Promise<GuardFn[]>)[]>;
  getManifestSnapshot: () => ManifestSnapshot;
  loadManifestAndTemplate: () => Promise<void>;
};

type SolidStream = ReturnType<typeof renderToStream>;

function renderApp(App: Component, url: string): SolidStream {
  return renderToStream(() => (
    <Router url={url}>
      <App />
    </Router>
  ));
}

async function render500(args: {
  App: Component;
  error: unknown;
  env: RuntimeEnv;
  manifest: RouteManifest;
  serverLoaderRegistry: Map<string, ServerLoader>;
  store: Map<string, unknown>;
}): Promise<SolidStream | string> {
  const error500Pattern = args.manifest.errors?.["500"];
  if (!error500Pattern) {
    const stack = args.error instanceof Error ? args.error.stack : String(args.error);
    return `<h1>500 Internal Server Error</h1><pre>${args.env.isDev ? stack : ""}</pre>`;
  }

  const error500Loader = args.serverLoaderRegistry.get(error500Pattern);
  if (error500Loader) {
    const message = args.error instanceof Error ? args.error.message : String(args.error);
    const stack = args.error instanceof Error ? args.error.stack : undefined;
    args.store.set(LOADER_DATA_KEY, { message, stack: args.env.isDev ? stack : undefined });

    try {
      return await ssrStorage.run(args.store, async () => renderApp(args.App, error500Pattern));
    } catch {
      return `<h1>500 Internal Server Error</h1>`;
    }
  }

  const stack = args.error instanceof Error ? args.error.stack : String(args.error);
  return `<h1>500 Internal Server Error</h1><pre>${args.env.isDev ? stack : ""}</pre>`;
}

function createHtmlResponseStream(args: {
  beforeEntry: string;
  renderStream: SolidStream | string;
  afterEntry: () => string;
  store: Map<string, unknown>;
  onComplete?: (html: string) => void;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const collected: string[] = [];
  const shouldCollect = Boolean(args.onComplete);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (shouldCollect) collected.push(chunk);
        controller.enqueue(encoder.encode(chunk));
      };

      enqueue(args.beforeEntry);

      if (typeof args.renderStream === "string") {
        enqueue(args.renderStream);
        const after = args.afterEntry();
        enqueue(after);
        args.onComplete?.(collected.join(""));
        controller.close();
        return;
      }

      const renderStream = args.renderStream;
      const writable = new WritableStream<string>({
        write(chunk) {
          enqueue(chunk);
        },
        close() {
          const after = args.afterEntry();
          enqueue(after);
          args.onComplete?.(collected.join(""));
          controller.close();
        },
        abort(error) {
          controller.error(error);
        },
      });

      void ssrStorage
        .run(args.store, async () => {
          await renderStream.pipeTo(writable);
        })
        .catch((error) => {
          controller.error(error);
        });
    },
  });
}

export function createRenderRequestHandler(options: RenderRequestOptions) {
  return async (c: Context) => {
    if (options.env.isDev) await options.loadManifestAndTemplate();

    const { template, manifest, sortedRoutes, staticRoutes, loaderRoutes, guardRoutes } = options.getManifestSnapshot();

    if (!template || !manifest) {
      return c.text("anaemia engine error: build assets are missing", 500);
    }

    const reqPath = c.req.path;
    const {
      activeChunk,
      targetPattern,
      statusCode: matchedStatus,
      params,
    } = matchRoute(manifest, reqPath, sortedRoutes);
    let statusCode: StatusCode = matchedStatus;
    const loaderArgs = { params, request: c.req.raw };

    const store = ssrStorage.getStore() || new Map<string, unknown>();
    let renderStream: SolidStream | string;

    const isStaticRoute = !options.env.isDev && staticRoutes.has(targetPattern);

    // serve from cache before doing any work
    if (isStaticRoute) {
      const cached = staticCache.get(reqPath);
      if (cached) {
        c.header("Content-Type", "text/html; charset=UTF-8");
        c.header("X-Anaemia-Cache", "HIT");
        return c.html(cached, statusCode as ContentfulStatusCode);
      }
    }

    if (targetPattern && guardRoutes.has(targetPattern)) {
      try {
        const guardResult = await runGuards(options.serverGuardRegistry, targetPattern, {
          params,
          request: c.req.raw,
          url: reqPath,
        });
        if (guardResult) {
          if ("redirect" in guardResult) {
            return c.redirect(guardResult.redirect, (guardResult.status ?? 302) as RedirectStatusCode);
          }
          if ("status" in guardResult) statusCode = guardResult.status as StatusCode;
        }
      } catch (err) {
        console.error("[anaemia] guard threw unexpectedly:", err);
        return c.text("Internal Server Error", 500);
      }
    }

    try {
      renderStream = await ssrStorage.run(store, async () => {
        if (targetPattern && loaderRoutes.has(targetPattern)) {
          const executableLoader = options.serverLoaderRegistry.get(targetPattern);
          if (executableLoader) {
            const initialLoaderData = await executableLoader(loaderArgs);
            store.set(LOADER_DATA_KEY, initialLoaderData);
          }
        }

        await options.preloadActiveClientRoute(reqPath);
        return renderApp(options.App, reqPath);
      });
    } catch (err) {
      statusCode = 500;
      console.error("[anaemia framework] runtime execution crash handled:", err);
      renderStream = await render500({
        App: options.App,
        error: err,
        env: options.env,
        manifest,
        serverLoaderRegistry: options.serverLoaderRegistry,
        store,
      });
    }

    const routeAssetTags = getRouteAssetTags(manifest, activeChunk);
    const headInjections = `${createDevNoCacheHeadTags(options.env.isDev)}${routeAssetTags.styles}${createHydrationRuntimeScript()}`;
    const shell = createHtmlStreamShell({ template, headInjections, bodyInjections: "" });

    setDevResponseCacheHeaders(c, options.env);
    c.status(statusCode);
    c.header("Content-Type", "text/html; charset=UTF-8");

    return c.body(
      createHtmlResponseStream({
        beforeEntry: shell.beforeEntry,
        renderStream,
        afterEntry: () => {
          const bodyInjections = `${createHydrationDataScript(store)}${routeAssetTags.scripts}`;
          return shell.afterEntry.includes("</body>")
            ? shell.afterEntry.replace("</body>", `${bodyInjections}</body>`)
            : `${shell.afterEntry}${bodyInjections}`;
        },
        store,
        onComplete: isStaticRoute ? (html) => staticCache.set(reqPath, html) : undefined,
      }),
    );
  };
}
