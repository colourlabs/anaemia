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
      return {
        ...route,
        isStatic: meta?.isStatic ?? false,
        hasLoader: meta?.hasLoader ?? false,
        hasGuard: meta?.hasGuard ?? false,
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
