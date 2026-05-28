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

        for (const chunk of compilation.chunks) {
          if (!chunk.name) continue;

          const files = Array.from(chunk.files);
          const jsFile = files.find((f) => f.endsWith(".js") && !f.includes(".hot-update."));
          const cssFile = files.find((f) => f.endsWith(".css") && !f.includes(".hot-update."));

          if (jsFile) {
            currentManifest.chunks[chunk.name] = {
              js: `/${jsFile}`,
              ...(cssFile && { css: `/${cssFile}` }),
            };
          }
        }

        fs.writeFileSync(manifestPath, JSON.stringify(currentManifest, null, 2));
      } catch (e) {
        console.error("[anaemia compiler] failed updating route-manifest with assets:", e);
      }
    });
  }
}
