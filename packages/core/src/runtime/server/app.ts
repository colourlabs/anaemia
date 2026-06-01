import { Hono } from "hono";
import { compress } from "hono/compress";
import type { Component } from "solid-js";
import { ssrStorage } from "../context.js";
import { HONO_CONTEXT_KEY } from "../shared/constants.js";
import { registerAssetRoutes } from "./assets.js";
import { registerRpcRoute } from "./rpc.js";
import { createRenderRequestHandler } from "./render-request.jsx";
import type { RuntimeEnv } from "./types.js";
import type { GuardFn } from "./guards.js";
import type { ManifestSnapshot } from "./manifest.js";
import type { AnaemiaPlugin } from "../../config.js";

type ServerLoader = (args: { params: Record<string, string>; request: Request }) => unknown | Promise<unknown>;

type CreateServerAppOptions = {
  App: Component;
  env: RuntimeEnv;
  plugins: AnaemiaPlugin[];
  preloadActiveClientRoute: (path: string) => unknown | Promise<unknown>;
  serverLoaderRegistry: Map<string, ServerLoader>;
  serverGuardRegistry: Map<string, (() => Promise<GuardFn[]>)[]>;
  registerServerRoutes: (app: Hono) => void;
  getManifestSnapshot: () => ManifestSnapshot;
  loadManifestAndTemplate: () => Promise<void>;
};

export function createServerApp(options: CreateServerAppOptions) {
  const app = new Hono();

  app.use("*", compress());

  app.use("*", async (c, next) => {
    const store = new Map<string, unknown>();
    store.set(HONO_CONTEXT_KEY, c);
    return await ssrStorage.run(store, next);
  });

  registerAssetRoutes(app, options.env);
  registerRpcRoute(app);
  options.registerServerRoutes(app);

  app.get("*", createRenderRequestHandler(options));

  return app;
}
