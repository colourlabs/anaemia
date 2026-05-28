import type { RouteManifestEntry } from "./scan.js";
export interface BuildManifest {
    routes: RouteManifestEntry[];
    chunks: Record<string, {
        js: string;
        css?: string;
    }>;
    errors: Record<string, string>;
    buildTime: string;
}
export declare function writeManifest(appRoot: string, routes: RouteManifestEntry[]): void;
//# sourceMappingURL=manifest.d.ts.map