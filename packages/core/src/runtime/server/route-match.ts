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

function namedGroup(name: string, inner: string): string {
  // group names must be valid JS identifiers; a param like "[1x]" yields "1x"
  // which is not, so fall back to an anonymous group rather than throwing.
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return `(?<${name}>${inner})`;
  return `(${inner})`;
}

function toPatternRegExp(urlPattern: string): RegExp {
  // token out the `:param` / `*catchall` placeholders first so the remaining
  // literals can be escaped. route patterns are built from file system names,
  // which can legally contain regex metacharacters (".", "+", "(", ")" ...).
  // Without escaping, "/v2.0" would also match "/v2x0", "/cost(a)" would never
  // match itself, and "/foo(" would crash with a regex SyntaxError.
  const tokenized = urlPattern
    .replace(/\/:([a-zA-Z0-9_-]+)/g, "/__PARAM__:$1")
    .replace(/\/\*([a-zA-Z0-9_-]*)/g, "/__CATCHALL__:$1");
  const escaped = tokenized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `^${escaped
      .replace(/\/__PARAM__:([a-zA-Z0-9_-]+)/g, (_, name: string) => `/${namedGroup(name, "[^/]+")}`)
      .replace(/\/__CATCHALL__:([a-zA-Z0-9_-]*)/g, "/(?<catchall>.*)")}$`,
  );
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
    const match = toPatternRegExp(route.urlPattern).exec(reqPath);
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
