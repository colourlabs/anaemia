import fs from "node:fs";
import path from "node:path";
import type { RouteManifestEntry } from "../router/scan.js";
import type { RouteMetadata } from "../analyzer/checks/route-metadata.js";
import type { CssModuleInfo } from "../styles/css-modules.js";

function routeCssModules(routeFilePath: string, cssModules: CssModuleInfo[]): CssModuleInfo[] {
  return cssModules.filter((moduleInfo) => moduleInfo.importers.includes(routeFilePath));
}

export function writeManifest(
  appRoot: string,
  routes: RouteManifestEntry[],
  routeMetadata: RouteMetadata[],
  cssModules: CssModuleInfo[] = [],
) {
  const metadataMap = new Map(routeMetadata.map((m) => [path.resolve(appRoot, m.filePath), m]));

  const manifest = {
    routes: routes.map((route) => {
      const meta = metadataMap.get(route.filePath);
      // guards declared via `config.guards` in a page/layout `.config.ts` are
      // resolved during scanRoutes. the analyzer only flags a bare `guard`
      // export on the page itself, so both sources must be considered.
      const hasConfigGuard = route.guards.length > 0 || route.layouts.some((layout) => layout.guards.length > 0);
      const hasGuard = (meta?.hasGuard ?? false) || hasConfigGuard;

      return {
        urlPattern: route.urlPattern,
        chunkName: route.chunkName,
        params: route.params,
        type: route.type,
        // guarded routes must never be eligible for the static HTML cache,
        // otherwise an authenticated render can be served to anonymous users.
        isStatic: (meta?.isStatic ?? false) && !hasConfigGuard,
        hasLoader: meta?.hasLoader ?? false,
        hasGuard,
        serverFunctionIds: meta?.serverFunctionIds ?? [],
        cssModules: routeCssModules(
          meta?.filePath ?? path.relative(appRoot, route.filePath).replace(/\\/g, "/"),
          cssModules,
        ),
      };
    }),
    chunks: {},
    cssModules,
  };

  const manifestPath = path.resolve(appRoot, "./.anaemia/route-manifest.json");
  const manifestDir = path.dirname(manifestPath);
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
