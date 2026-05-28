export type RouteType = "page" | "layout" | "catch-all";
export interface LayoutManifestEntry {
    filePath: string;
    guards: RouteGuard[];
}
export interface RouteManifestEntry {
    urlPattern: string;
    filePath: string;
    chunkName: string;
    layouts: LayoutManifestEntry[];
    guards: RouteGuard[];
    type: RouteType;
    params: string[];
}
export interface ServerRouteEntry {
    urlPattern: string;
    filePath: string;
}
export type RouteGuard = (...args: unknown[]) => unknown;
export declare function scanServerRoutes(appRoot: string): ServerRouteEntry[];
export declare function scanRoutes(appRoot: string): Promise<RouteManifestEntry[]>;
//# sourceMappingURL=scan.d.ts.map