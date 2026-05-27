import fs from "fs";
import path from "path";
import type { RouteManifestEntry } from "./scan.js";

export interface BuildManifest {
  routes: RouteManifestEntry[];
  // filled in after rspack build - maps chunkName to hashed filename
  chunks: Record<string, { js: string; css?: string }>;
  buildTime: string;
}

export function writeManifest(appRoot: string, routes: RouteManifestEntry[]): void {
  const manifest: BuildManifest = {
    routes,
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