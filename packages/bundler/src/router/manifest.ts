import fs from "fs";
import path from "path";
import type { RouteManifestEntry } from "./scan.js";

export interface BuildManifest {
  routes: RouteManifestEntry[];
  // filled in after rspack build - maps chunkName to hashed filename
  chunks: Record<string, { js: string; css?: string }>;
  errors: Record<string, string>;
  buildTime: string;
}

export function writeManifest(appRoot: string, routes: RouteManifestEntry[]): void {
  const errors: Record<string, string> = {};

  for (const route of routes) {
    if (route.filePath.endsWith("404.tsx")) {
      errors["404"] = route.urlPattern;
    }
    if (route.filePath.endsWith("500.tsx")) {
      errors["500"] = route.urlPattern;
    }
  }

  const conventionalRoutes = routes.filter(
    (r) => !r.filePath.endsWith("404.tsx") && !r.filePath.endsWith("500.tsx")
  );

  const manifest: BuildManifest = {
    routes: conventionalRoutes,
    errors,
    chunks: {}, // rspack fills this in via ManifestPlugin
    buildTime: new Date().toISOString(),
  };

  const outDir = path.resolve(appRoot, "./dist");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.resolve(outDir, "route-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}