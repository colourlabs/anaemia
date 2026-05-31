import type { RouteManifest, RouteMatch } from "./types.js";

type SortedRoute = RouteManifest["routes"][number];

function scoreRoutePattern(pattern: string): number {
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce((acc, segment) => {
    if (segment.startsWith(":")) return acc - 1;
    if (segment === "*" || segment.startsWith("*")) return acc - 2;
    return acc;
  }, segments.length * 10);
}

export function sortRoutes(routes: RouteManifest["routes"]): SortedRoute[] {
  return [...routes].sort((a, b) => scoreRoutePattern(b.urlPattern) - scoreRoutePattern(a.urlPattern));
}

export function matchRoute(
  manifest: RouteManifest,
  reqPath: string,
  sortedRoutes = sortRoutes(manifest.routes),
): RouteMatch {
  for (const route of sortedRoutes) {
    const regexStr = route.urlPattern
      .replace(/:([a-zA-Z0-9_-]+)/g, "(?<$1>[^/]+)")
      .replace(/\*([a-zA-Z0-9_-]*)/g, "(?<catchall>.*)");

    const match = new RegExp(`^${regexStr}$`).exec(reqPath);
    if (match) {
      return {
        activeChunk: route.chunkName,
        targetPattern: route.urlPattern,
        statusCode: 200,
        params: match.groups ? { ...match.groups } : {},
      };
    }
  }

  return {
    activeChunk: "route-404",
    targetPattern: manifest.errors?.["404"] || "",
    statusCode: 404,
    params: {},
  };
}
