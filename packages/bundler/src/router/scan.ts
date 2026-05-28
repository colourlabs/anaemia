import { glob } from "glob";
import path from "path";
import { createJiti } from "jiti";
import fs from "node:fs";
import { getAliases } from "../aliases.js";

function createScanJiti(appRoot: string) {
  return createJiti(import.meta.url, {
    interopDefault: true,
    alias: getAliases(appRoot),
  });
}

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

interface RouteConfigShape {
  guards?: RouteGuard[];
}

interface RouteModule {
  config?: RouteConfigShape;
  default?: unknown;
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

function resolveConfigPath(absolutePath: string): string {
  const configPath = absolutePath
    .replace(/\.(tsx|jsx)$/, ".config.$1")
    .replace(".config.tsx", ".config.ts")
    .replace(".config.jsx", ".config.js");
  return fs.existsSync(configPath) ? configPath : absolutePath;
}

export async function scanRoutes(appRoot: string): Promise<RouteManifestEntry[]> {
  const jiti = createScanJiti(appRoot);
  const routesDir = path.resolve(appRoot, "./src/routes");
  const files = glob.sync("**/*.{tsx,jsx}", { cwd: routesDir, posix: true });

  const layoutMap = new Map<string, LayoutManifestEntry>();
  for (const file of files) {
    const filename = path.basename(file);
    if (LAYOUT_FILE.test(filename)) {
      const dir = path.dirname(file);
      const absolutePath = path.resolve(routesDir, file);

      let layoutGuards: RouteGuard[] = [];

      try {
        const layoutModule = (await jiti.import(resolveConfigPath(absolutePath))) as RouteModule;
        if (layoutModule?.config?.guards) {
          layoutGuards = layoutModule.config.guards;
        }
      } catch {
        console.warn(`[anaemia bundler warning]: Failed parsing config flags on layout: ${file}`);
      }

      layoutMap.set(dir, {
        filePath: absolutePath,
        guards: layoutGuards,
      });
    }
  }

  const entries: RouteManifestEntry[] = [];

  for (const file of files) {
    const filename = path.basename(file);
    const dir = path.dirname(file);

    if (LAYOUT_FILE.test(filename)) continue;
    if (filename.includes(".config.")) continue;

    const absolutePagePath = path.resolve(routesDir, file);
    const { urlPattern, chunkName, params, type } = parseFilePath(file);

    let pageGuards: RouteGuard[] = [];

    try {
      const pageModule = (await jiti.import(resolveConfigPath(absolutePagePath))) as RouteModule;
      if (pageModule?.config?.guards) {
        pageGuards = pageModule.config.guards;
      }
    } catch {
      // quietly ignore parsing problems for pure components lacking a config wrapper
    }

    entries.push({
      urlPattern,
      filePath: absolutePagePath,
      chunkName,
      layouts: resolveLayoutChain(dir, layoutMap),
      guards: pageGuards,
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
      const cleanName = segment.replace(/\.(tsx|jsx)$/, "");

      if (CATCH_ALL_FILE.test(segment)) {
        const match = segment.match(CATCH_ALL_FILE)!;
        params.push(match[1]);
        urlParts.push(`*`);
        type = "catch-all";
      } else if (DYNAMIC_SEGMENT.test(segment)) {
        const match = segment.match(DYNAMIC_SEGMENT)!;
        params.push(match[1]);
        urlParts.push(`:${match[1]}`);
      } else if (cleanName !== "index") {
        urlParts.push(cleanName);
      }
    } else {
      if (segment.startsWith("[...") && segment.endsWith("]")) {
        const param = segment.slice(4, -1);
        params.push(param);
        urlParts.push(`*`);
        type = "catch-all";
      } else if (segment.startsWith("[") && segment.endsWith("]")) {
        const param = segment.slice(1, -1);
        params.push(param);
        urlParts.push(`:${param}`);
      } else {
        urlParts.push(segment);
      }
    }
  }

  const filteredParts = urlParts.filter((part) => part !== "" && part !== ".");
  const urlPattern = filteredParts.length === 0 ? "/" : "/" + filteredParts.join("/");

  const chunkName = file
    .replace(/\.(tsx|jsx)$/, "")
    .replace(/\[\.\.\.(.+?)\]/g, "catchall-$1")
    .replace(/\[(.+?)\]/g, "param-$1")
    .replace(/\//g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return { urlPattern, chunkName, params, type };
}

function resolveLayoutChain(dir: string, layoutMap: Map<string, LayoutManifestEntry>): LayoutManifestEntry[] {
  const layouts: LayoutManifestEntry[] = [];
  let current = dir;

  while (true) {
    const layoutEntry = layoutMap.get(current);
    if (layoutEntry) layouts.unshift(layoutEntry);
    if (current === "." || current === "") break;
    current = path.dirname(current);
  }

  return layouts;
}