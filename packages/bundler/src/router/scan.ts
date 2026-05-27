import { glob } from "glob";
import path from "path";

export type RouteType = "page" | "layout" | "catch-all";

export interface RouteManifestEntry {
  // the URL pattern this route matches
  // e.g. /blog/:slug, /dashboard, /
  urlPattern: string;
  
  // absolute path to the route file
  filePath: string;

  // rspack chunk name derived from the path
  chunkName: string;

  // ordered list of layout files that wrap this route
  // e.g. [root layout, dashboard layout]
  layouts: string[];
  // what type of file this is
  type: RouteType;

  // the dynamic params this route exposes
  // e.g. /blog/[slug] -> ["slug"]
  params: string[];
}

export interface ServerRouteEntry {
  urlPattern: string;
  filePath: string;
}

const LAYOUT_FILE = /^_layout\.(tsx|jsx)$/;
const CATCH_ALL_FILE = /^\[\.\.\.(.+?)\]\.(tsx|jsx)$/;
const DYNAMIC_SEGMENT = /^\[(.+?)\]\.(tsx|jsx)$/;

export function scanServerRoutes(appRoot: string): ServerRouteEntry[] {
  const routesDir = path.resolve(appRoot, "./src/routes");
  const files = glob.sync("**/_route.{ts,tsx}", { cwd: routesDir, posix: true });

  return files.map((file) => {
    const dir = path.dirname(file);
    const urlPattern = dir === "." ? "/" : `/${dir}`;
    return {
      urlPattern,
      filePath: path.resolve(routesDir, file),
    };
  });
}

export function scanRoutes(appRoot: string): RouteManifestEntry[] {
  const routesDir = path.resolve(appRoot, "./src/routes");
  const files = glob.sync("**/*.{tsx,jsx}", { cwd: routesDir, posix: true });

  // build a map of dir -> layout file for quick lookup
  const layoutMap = new Map<string, string>();
  for (const file of files) {
    const filename = path.basename(file);
    if (LAYOUT_FILE.test(filename)) {
      const dir = path.dirname(file);
      layoutMap.set(dir, path.resolve(routesDir, file));
    }
  }

  const entries: RouteManifestEntry[] = [];

  for (const file of files) {
    const filename = path.basename(file);
    const dir = path.dirname(file);

    // skip layout files - they're referenced by pages, not routes themselves
    if (LAYOUT_FILE.test(filename)) continue;

    const { urlPattern, chunkName, params, type } = parseFilePath(file);

    // walk up the directory tree to collect layouts
    const layouts = resolveLayoutChain(dir, layoutMap);

    entries.push({
      urlPattern,
      filePath: path.resolve(routesDir, file),
      chunkName,
      layouts,
      type,
      params,
    });
  }

  return entries;
}

function parseFilePath(file: string): {
  urlPattern: string;
  chunkName: string;
  params: string[];
  type: RouteType;
} {
  const segments = file.split("/");
  const urlParts: string[] = [];
  const params: string[] = [];
  let type: RouteType = "page";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    if (isLast) {
      // strip extension and handle special filenames
      const catchAll = segment.match(CATCH_ALL_FILE);
      const dynamic = segment.match(DYNAMIC_SEGMENT);

      if (catchAll) {
        params.push(catchAll[1]);
        urlParts.push(`*`);
        type = "catch-all";
      } else if (dynamic) {
        params.push(dynamic[1]);
        urlParts.push(`:${dynamic[1]}`);
      } else {
        // index.tsx -> don't add a segment
        const name = segment.replace(/\.(tsx|jsx)$/, "");
        if (name !== "index") urlParts.push(name);
      }
    } else {
      // directory segment
      if (segment.startsWith("[") && segment.endsWith("]")) {
        const param = segment.slice(1, -1);
        params.push(param);
        urlParts.push(`:${param}`);
      } else {
        urlParts.push(segment);
      }
    }
  }

  const urlPattern = "/" + urlParts.join("/");
  const chunkName = file
    .replace(/\.(tsx|jsx)$/, "")
    .replace(/\[\.\.\.(.+?)\]/, "catchall-$1")
    .replace(/\[(.+?)\]/g, "param-$1")
    .replace(/\//g, "-")
    .replace(/^-/, "");

  return { urlPattern, chunkName, params, type };
}

function resolveLayoutChain(
  dir: string,
  layoutMap: Map<string, string>,
): string[] {
  const layouts: string[] = [];
  let current = dir;

  while (true) {
    const layout = layoutMap.get(current);
    if (layout) layouts.unshift(layout);

    if (current === "." || current === "") break;
    current = path.dirname(current);
  }

  return layouts;
}