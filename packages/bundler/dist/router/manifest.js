import fs from "fs";
import path from "path";
export function writeManifest(appRoot, routes) {
    const errors = {};
    for (const route of routes) {
        if (route.filePath.endsWith("404.tsx")) {
            errors["404"] = route.urlPattern;
        }
        if (route.filePath.endsWith("500.tsx")) {
            errors["500"] = route.urlPattern;
        }
    }
    const conventionalRoutes = routes.filter((r) => !r.filePath.endsWith("404.tsx") && !r.filePath.endsWith("500.tsx"));
    const manifest = {
        routes: conventionalRoutes,
        errors,
        chunks: {}, // rspack fills this in via ManifestPlugin
        buildTime: new Date().toISOString(),
    };
    const outDir = path.resolve(appRoot, "./dist");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.resolve(outDir, "route-manifest.json"), JSON.stringify(manifest, null, 2));
}
