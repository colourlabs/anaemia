import { Router } from "@solidjs/router";
import type { Component } from "solid-js";
import type { Context } from "hono";
import type { RedirectStatusCode, StatusCode } from "hono/utils/http-status";
import { renderToStream } from "solid-js/web";
import { ssrStorage } from "../context.js";
import { SSRDocumentProvider, setCurrentSSRDocument, releaseSSRDocument } from "../document.js";
import { LOADER_DATA_KEY, RPC_TOKEN_KEY } from "../constants.js";
import { setDevResponseCacheHeaders } from "./assets.js";
import { runGuards, type GuardFn } from "./guards.js";
import {
  applyFrameworkDocumentDefaults,
  applyPluginDocumentHooks,
  createHtmlDocumentShell,
  createSSRDocumentFromTemplate,
} from "../document/template.js";
import { createHydrationDataScript, createHydrationRuntimeScript } from "../document/hydration.js";
import { getLogger } from "./logger.js";
import { matchRoute } from "./route-match.js";
import { createRpcToken } from "./rpc/security.js";
import { STATIC_CACHE_MAX_AGE_SECONDS, createStaticHtmlCacheForHtml } from "./static-html-cache.js";
import type { RouteManifest, RuntimeEnv } from "./types.js";
import type { ManifestSnapshot } from "./manifest.js";
import type { AnaemiaPlugin } from "../../config.js";
import type { SSRDocument } from "../document/types.js";

const staticCache = createStaticHtmlCacheForHtml();

// TextEncoder is stateless; a single shared instance avoids one allocation per
// response stream.
const textEncoder = new TextEncoder();

type ServerLoader = (args: { params: Record<string, string>; request: Request }) => unknown | Promise<unknown>;

type RenderRequestOptions = {
  App: Component;
  env: RuntimeEnv;
  preloadActiveClientRoute: (path: string) => unknown | Promise<unknown>;
  serverLoaderRegistry: Map<string, ServerLoader>;
  serverGuardRegistry: Map<string, (() => Promise<GuardFn[]>)[]>;
  getManifestSnapshot: () => ManifestSnapshot;
  loadManifestAndTemplate: () => Promise<void>;
  plugins?: AnaemiaPlugin[];
};

type SolidStream = ReturnType<typeof renderToStream>;

function renderApp(App: Component, url: string, document: SSRDocument): SolidStream {
  return renderToStream(() => (
    <Router url={url}>
      <SSRDocumentProvider document={document}>
        <App />
      </SSRDocumentProvider>
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
  document: SSRDocument;
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
      return await ssrStorage.run(args.store, async () => renderApp(args.App, error500Pattern, args.document));
    } catch {
      return `<h1>500 Internal Server Error</h1>`;
    }
  }

  const stack = args.error instanceof Error ? args.error.stack : String(args.error);
  return `<h1>500 Internal Server Error</h1><pre>${args.env.isDev ? stack : ""}</pre>`;
}

function createHtmlResponseStream(args: {
  beforeEntry: () => string;
  renderStream: SolidStream | string;
  afterEntry: () => string;
  store: Map<string, unknown>;
  renderKey: symbol;
  onComplete?: (html: string) => void;
}): ReadableStream<Uint8Array> {
  const encoder = textEncoder;
  const collected: string[] = [];
  const shouldCollect = Boolean(args.onComplete);
  const MAX_BUFFER_BYTES = 16_384;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // buffers body HTML as a string and encodes/enqueues it in large
      // batches. Solid emits a stream of tiny chunks (often one per row/cell);
      // encoding each individually bloats the response machinery. the shell is
      // flushed immediately to keep TTFB low.
      let buffered = "";
      const flush = () => {
        if (!buffered) return;
        controller.enqueue(encoder.encode(buffered));
        buffered = "";
      };
      const enqueue = (chunk: string, force = false) => {
        if (shouldCollect) collected.push(chunk);
        buffered += chunk;
        if (force || buffered.length >= MAX_BUFFER_BYTES) flush();
      };

      if (typeof args.renderStream === "string") {
        enqueue(args.beforeEntry());
        enqueue(args.renderStream);
        enqueue(args.afterEntry());
        flush();
        args.onComplete?.(collected.join(""));
        releaseSSRDocument(args.renderKey);
        controller.close();
        return;
      }

      const renderStream = args.renderStream;
      let completed = false;

      const finish = () => {
        if (completed) return;
        completed = true;
        releaseSSRDocument(args.renderKey);
      };

      // shell-first streaming: flush the document head immediately, then batch
      // body chunks as they arrive, and close the document on completion.
      enqueue(args.beforeEntry(), true);

      void (
        renderStream.pipeTo(
          new WritableStream<string>({
            write(chunk) {
              enqueue(chunk);
            },
            close() {
              enqueue(args.afterEntry());
              flush();
              args.onComplete?.(collected.join(""));
              finish();
              controller.close();
            },
            abort(error) {
              finish();
              controller.error(error);
            },
          }),
        ) as unknown as Promise<void>
      ).catch((error) => {
        finish();
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

    // serve fully-rendered static pages from the HTML cache before touching the
    // render pipeline. only 200 responses are ever stored (and only when not in
    // dev), so a hit is authoritative and needs no route matching, document
    // parsing, or token minting.
    if (!options.env.isDev) {
      const cached = staticCache.get(reqPath);
      if (cached) {
        c.header("Content-Type", "text/html; charset=UTF-8");
        c.header("Cache-Control", `public, max-age=${STATIC_CACHE_MAX_AGE_SECONDS}`);
        c.header("X-Anaemia-Cache", "HIT");
        return c.html(cached, 200);
      }
    }

    const {
      activeChunk,
      targetPattern,
      statusCode: matchedStatus,
      params,
    } = matchRoute(manifest, reqPath, sortedRoutes);
    let statusCode: StatusCode = matchedStatus;
    const loaderArgs = { params, request: c.req.raw };

    const store = ssrStorage.getStore() || new Map<string, unknown>();
    // CSRF token embedded into the hydration payload and required by /_rpc.
    // the store is request-scoped (see app.ts middleware), so this is safe
    // under concurrent renders; createRpcToken itself re-uses the last token
    // for a short window to avoid signing anew on every render.
    if (!store.has(RPC_TOKEN_KEY)) store.set(RPC_TOKEN_KEY, createRpcToken());
    const ssrDocument = createSSRDocumentFromTemplate(template);
    let renderStream: SolidStream | string;
    let documentConfigured = false;
    const plugins = options.plugins ?? [];
    const url = new URL(c.req.url);

    const configureDocument = async () => {
      if (documentConfigured) return;

      applyFrameworkDocumentDefaults({
        doc: ssrDocument,
        manifest,
        activeChunk,
        isDev: options.env.isDev,
        hydrationRuntimeScript: createHydrationRuntimeScript(),
        hydrationDataScript: createHydrationDataScript(store),
      });

      await applyPluginDocumentHooks({
        doc: ssrDocument,
        plugins,
        ctx: {
          request: c.req.raw,
          url,
          pathname: reqPath,
          params,
          routePattern: targetPattern,
          isDev: options.env.isDev,
        },
      });

      documentConfigured = true;
    };

    const isStaticRoute = !options.env.isDev && staticRoutes.has(targetPattern);

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
        getLogger().error("guard threw unexpectedly", err);
        return c.text("Internal Server Error", 500);
      }
    }

    const renderKey = setCurrentSSRDocument(ssrDocument);

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
        await configureDocument();
        return renderApp(options.App, reqPath, ssrDocument);
      });
    } catch (err) {
      statusCode = 500;
      getLogger().error("runtime execution crash handled", err);
      await configureDocument();
      renderStream = await render500({
        App: options.App,
        error: err,
        env: options.env,
        manifest,
        serverLoaderRegistry: options.serverLoaderRegistry,
        store,
        document: ssrDocument,
      });
    }

    setDevResponseCacheHeaders(c, options.env);
    c.status(statusCode);
    c.header("Content-Type", "text/html; charset=UTF-8");

    // explicit caching story for HTML:
    //   - static 200 pages are publicly cacheable for the static-cache TTL
    //   - everything else (dynamic pages, 404, 500) must not be cached by
    //     browsers or shared caches, avoiding heuristic-based surprises.
    if (!options.env.isDev) {
      c.header(
        "Cache-Control",
        isStaticRoute && statusCode === 200 ? `public, max-age=${STATIC_CACHE_MAX_AGE_SECONDS}` : "no-store",
      );
    }

    return c.body(
      createHtmlResponseStream({
        beforeEntry: () => {
          const shell = createHtmlDocumentShell(ssrDocument);
          return shell.beforeEntry;
        },
        renderStream,
        afterEntry: () => {
          const shell = createHtmlDocumentShell(ssrDocument);
          return shell.afterEntry;
        },
        store,
        renderKey,
        onComplete: isStaticRoute && statusCode === 200 ? (html) => staticCache.set(reqPath, html) : undefined,
      }),
    );
  };
}
