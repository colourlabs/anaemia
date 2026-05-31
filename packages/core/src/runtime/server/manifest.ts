import fs from "node:fs";
import type { RouteManifest, RuntimeEnv } from "./types.js";
import { sortRoutes } from "./route-match.js";

export type ManifestSnapshot = {
  template: string;
  manifest: RouteManifest | null;
  sortedRoutes: RouteManifest["routes"];
  staticRoutes: Set<string>; // routes safe to cache indefinitely
  loaderRoutes: Set<string>; // routes that need loader execution
  guardRoutes: Set<string>; // routes that need guard execution
};

export function createManifestStore(env: RuntimeEnv) {
  let memoizedHtmlTemplate = "";
  let memoizedManifest: RouteManifest | null = null;
  let memoizedSortedRoutes: RouteManifest["routes"] = [];

  const load = async () => {
    if (env.isDev) {
      try {
        memoizedHtmlTemplate = await fetch(`${env.devServerUrl}/index.html`).then((response) => {
          if (!response.ok) throw new Error(`index.html fetch failed: ${response.status}`);
          return response.text();
        });
      } catch (err) {
        console.error("[anaemia engine sync error - HTML fetch failed]:", err);
        memoizedHtmlTemplate = "";
      }

      try {
        if (fs.existsSync(env.manifestPath)) {
          memoizedManifest = JSON.parse(fs.readFileSync(env.manifestPath, "utf-8")) as RouteManifest;
        } else {
          memoizedManifest = { routes: [], chunks: {}, errors: {} };
        }
      } catch (err) {
        console.error("[anaemia engine sync error - manifest read failed]:", err);
        memoizedManifest = { routes: [], chunks: {}, errors: {} };
      }
    } else {
      try {
        if (fs.existsSync(env.templatePath)) memoizedHtmlTemplate = fs.readFileSync(env.templatePath, "utf-8");
        if (fs.existsSync(env.manifestPath)) {
          memoizedManifest = JSON.parse(fs.readFileSync(env.manifestPath, "utf-8")) as RouteManifest;
        }
      } catch {
        console.warn("build assets not fully initialized during bootstrapping cycle.");
      }
    }

    memoizedSortedRoutes = memoizedManifest ? sortRoutes(memoizedManifest.routes) : [];
  };

  const getSnapshot = (): ManifestSnapshot => ({
    template: memoizedHtmlTemplate,
    manifest: memoizedManifest,
    sortedRoutes: memoizedSortedRoutes,
  });

  return { load, getSnapshot };
}
