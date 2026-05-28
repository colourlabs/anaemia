import fs from "node:fs";
import path from "node:path";
import type { RspackPluginInstance, Compiler } from "@rspack/core";

interface HydrationPluginOptions {
  appRoot: string;
}

export class AnaemiaManifestHydrationPlugin implements RspackPluginInstance {
  private appRoot: string;

  constructor(options: HydrationPluginOptions) {
    this.appRoot = options.appRoot;
  }

  apply(compiler: Compiler) {
    compiler.hooks.emit.tap("AnaemiaManifestHydrationPlugin", (compilation) => {
      const manifestPath = path.resolve(this.appRoot, "./dist/route-manifest.json");

      if (!fs.existsSync(manifestPath)) return;

      try {
        const currentManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

        if (!currentManifest.chunks) {
          currentManifest.chunks = {};
        }

        for (const chunk of compilation.chunks) {
          if (!chunk.name) continue;

          const files = Array.from(chunk.files);

          const jsFiles = files.filter(
            (f) => f.endsWith(".js") && !f.includes(".hot-update.") && !f.endsWith(".js.map")
          );

          const cssFiles = files.filter(
            (f) => f.endsWith(".css") && !f.includes(".hot-update.") && !f.endsWith(".css.map")
          );

          if (jsFiles.length > 0 || cssFiles.length > 0) {
            currentManifest.chunks[chunk.name] = {
              js: jsFiles.map((f) => `/${f}`),
              css: cssFiles.map((f) => `/${f}`),
            };
          }
        }

        fs.writeFileSync(manifestPath, JSON.stringify(currentManifest, null, 2));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[anaemia compiler] failed updating route-manifest with assets:", message);
      }
    });
  }
}