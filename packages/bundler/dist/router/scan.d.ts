export declare function createScanJiti(appRoot: string): import("jiti").Jiti;
export type RouteType = "page" | "layout" | "catch-all";
export interface LayoutManifestEntry {
    filePath: string;
    guards: any[];
}
export interface RouteManifestEntry {
    urlPattern: string;
    filePath: string;
    chunkName: string;
    layouts: LayoutManifestEntry[];
    guards: any[];
    type: RouteType;
    params: string[];
}
export interface ServerRouteEntry {
    urlPattern: string;
    filePath: string;
}
export declare function scanServerRoutes(appRoot: string): ServerRouteEntry[];
export declare function scanRoutes(appRoot: string): Promise<RouteManifestEntry[]>;
//# sourceMappingURL=scan.d.ts.map