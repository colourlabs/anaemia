import fs from "fs";
import path from "path";
import type { RouteManifestEntry } from "./scan.js";

type LayoutNode = {
  kind: "layout";
  layoutFile: string;
  layoutIdx: number;
  relativePath: string;
  prefixPath: string;
  children: TreeNode[];
};

type PageNode = {
  kind: "page";
  route: RouteManifestEntry;
  routeIdx: number;
  relativePath: string;
};

type TreeNode = LayoutNode | PageNode;

function buildTree(routes: RouteManifestEntry[], strippedLayouts: string[][], routeIndices: number[], routesDir: string, allLayouts: Map<string, number>, parentPrefix: string): TreeNode[] {
  const nodes: TreeNode[] = [];
  const leafIndices = strippedLayouts.map((l, i) => (l.length === 0 ? i : -1)).filter((i) => i !== -1);

  for (const i of leafIndices) {
    const route = routes[routeIndices[i]];
    const relativePath = toRelativePath(route.urlPattern, parentPrefix);
    nodes.push({
      kind: "page",
      route,
      routeIdx: routeIndices[i],
      relativePath,
    });
  }

  const byLayout = new Map<string, { ri: number[]; sl: string[][] }>();
  for (let i = 0; i < strippedLayouts.length; i++) {
    if (strippedLayouts[i].length === 0) continue;
    const nextLayout = strippedLayouts[i][0];
    if (!byLayout.has(nextLayout)) byLayout.set(nextLayout, { ri: [], sl: [] });
    byLayout.get(nextLayout)!.ri.push(routeIndices[i]);
    byLayout.get(nextLayout)!.sl.push(strippedLayouts[i].slice(1));
  }

  for (const [layoutFile, { ri, sl }] of byLayout) {
    const layoutIdx = allLayouts.get(layoutFile)!;
    const layoutDir = path.dirname(path.relative(routesDir, layoutFile));
    const prefixPath = layoutDir === "." ? "/" : `/${layoutDir.replace(/\\/g, "/")}`;
    const relativePath = toRelativePath(prefixPath, parentPrefix);

    const children = buildTree(routes, sl, ri, routesDir, allLayouts, prefixPath);
    nodes.push({ kind: "layout", layoutFile, layoutIdx, prefixPath, children, relativePath });
  }

  return nodes;
}

function toRelativePath(absolute: string, parentPrefix: string): string {
  if (parentPrefix === "/" || parentPrefix === "") return absolute;
  if (absolute.startsWith(parentPrefix)) {
    const rel = absolute.slice(parentPrefix.length) || "/";
    return rel.startsWith("/") ? rel : `/${rel}`;
  }
  return absolute;
}

function renderTree(nodes: TreeNode[], indent = 6): string {
  const pad = " ".repeat(indent);
  return nodes
    .map((node) => {
      if (node.kind === "page") {
        let routePath = node.relativePath;

        if (node.route.type === "catch-all") {
          const paramName = node.route.params[0] || "any";
          if (routePath.endsWith("*")) {
            routePath = routePath.slice(0, -1) + `*${paramName}`;
          }
        }

        if (indent > 6 && routePath === "/") {
          routePath = "";
        } else if (indent > 6 && routePath.startsWith("/") && routePath !== "/") {
          routePath = routePath.slice(1);
        }

        if (routePath === "") {
          return `${pad}<Route component={Route${node.routeIdx}Wrapped} />`;
        }
        
        return `${pad}<Route path="${routePath}" component={Route${node.routeIdx}Wrapped} />`;
      }

      let layoutPath = (node as any).relativePath;
      const inner = renderTree(node.children, indent + 2);

      return [`${pad}<Route path="${layoutPath}" component={Layout${node.layoutIdx}}>`, inner, `${pad}</Route>`].join("\n");
    })
    .join("\n");
}

function buildPreloadMapString(routes: RouteManifestEntry[], allLayouts: Map<string, number>): string {
  const mapLines = routes.map((r, i) => {
    const layoutTokens = r.layouts.map((l) => `Layout${allLayouts.get(l.filePath)}`);
    const pageToken = `Route${i}`;
    const tokensArrayString = `[${[...layoutTokens, pageToken].join(", ")}]`;
    return `  "${r.urlPattern}": ${tokensArrayString}`;
  });

  return `const chunkPreloadRegistry = {\n${mapLines.join(",\n")}\n};`;
}

export function generateRouterEntry(appRoot: string, routes: RouteManifestEntry[]): string {
  const routesDir = path.resolve(appRoot, "./src/routes");
  const outDir = path.resolve(appRoot, "./.anaemia");
  const outPath = path.resolve(outDir, "./__anaemia_entry__.tsx");

  const conventionalRoutes = routes.filter((r) => !r.filePath.endsWith("404.tsx") && !r.filePath.endsWith("500.tsx"));
  const errorRoutes = routes.filter((r) => r.filePath.endsWith("404.tsx") || r.filePath.endsWith("500.tsx"));

  const allLayouts = new Map<string, number>();

  let layoutIndex = 0;
  for (const entry of conventionalRoutes) {
    for (const layout of entry.layouts) {
      if (!allLayouts.has(layout.filePath)) {
        allLayouts.set(layout.filePath, layoutIndex++);
      }
    }
  }

  const routeImports = conventionalRoutes
    .map((r, i) => {
      const relativeToRoutes = path.relative(routesDir, r.filePath);
      const chunkName = relativeToRoutes
        .replace(/\.[jt]sx?$/, "")
        .replace(/[^a-zA-Z0-9-_\[\]]/g, "-")
        .toLowerCase();

      const guardSources = [...r.layouts.map((l) => l.filePath), r.filePath]
        .map((fp) => {
          const configPath = fp.replace(/\.(tsx|jsx)$/, ".config.ts");
          const guardPath = fs.existsSync(configPath) ? configPath : fp.replace(/\.(jsx)$/, ".config.js");
          const resolvedGuardPath = fs.existsSync(guardPath) ? guardPath : fp;
          return `() => import("${resolvedGuardPath.replace(/\\/g, "/")}").then(m => m?.config?.guards ?? [])`;
        })
        .join(",\n    ");

      return `
const Route${i} = lazy(() => import(/* webpackChunkName: "${chunkName}" */ "${r.filePath.replace(/\\/g, "/")}"));
const Route${i}Loader = async (args) => {
  const _guardSources = [
    ${guardSources}
  ];
  for (const loadGuards of _guardSources) {
    const guards = await loadGuards();
    for (const guard of guards) {
      const result = await guard({ params: args.params, request: args.request, url: args.location?.pathname ?? "" });
      if (result?.redirect) {
        throw Object.assign(new Error("guard:redirect"), { redirect: result.redirect, status: result.status ?? 302 });
      }
      if (result?.status) {
        throw Object.assign(new Error("guard:error"), { status: result.status });
      }
    }
  }
  return import(/* webpackChunkName: "${chunkName}" */ "${r.filePath.replace(/\\/g, "/")}").then(mod => {
    return mod.loader ? mod.loader(args) : null;
  });
};
const Route${i}Wrapped = (props) => (
  <RouteDataController loader={Route${i}Loader}>
    <Route${i} {...props} />
  </RouteDataController>
);`.trim();
    })
    .join("\n");

  const layoutImports = [...allLayouts.entries()]
    .map(([file, i]) => {
      const relativeToRoutes = path.relative(routesDir, file);
      const chunkName = ("layout-" + relativeToRoutes.replace(/\.[jt]sx?$/, "").replace(/[^a-zA-Z0-9-_\[\]]/g, "-")).toLowerCase();

      return `import Layout${i} from "${file.replace(/\\/g, "/")}";`;
    })
    .join("\n");

  const tree = buildTree(
    conventionalRoutes,
    conventionalRoutes.map((r) => r.layouts.map((l) => l.filePath)),
    conventionalRoutes.map((_, i) => i),
    routesDir,
    allLayouts,
    "/"
  );

  let routeJsx = renderTree(tree, 6);

  const has404 = errorRoutes.some((r) => r.filePath.endsWith("404.tsx"));
  if (has404) {
    const idx = routes.findIndex((r) => r.filePath.endsWith("404.tsx"));
    routeJsx += `\n      <Route path="*any" component={Route${idx}} />`;
  }

  const rootWrapperPath = path.resolve(appRoot, "./src/root.tsx");
  const hasRootWrapper = fs.existsSync(rootWrapperPath);

  const rootImport = hasRootWrapper ? `import RootWrapper from "../src/root.tsx";` : ``;

  const rootWrapperCode = hasRootWrapper
    ? `const RootWrapperComponent = (props) => (
  <RootWrapper {...props} />
);`
    : ``;

  const finalJsx = hasRootWrapper
    ? `    <Route component={RootWrapperComponent}>
${routeJsx}
    </Route>`
    : routeJsx;

  const registryEntries = routes
    .map((r) => {
      return `  ["${r.urlPattern}", async (args) => {
    const mod = await import("${r.filePath.replace(/\\/g, "/")}");
    return mod.loader ? mod.loader(args) : null;
  }]`;
    })
    .join(",\n");

  const guardRegistryEntries = conventionalRoutes
    .map((r) => {
      const sources = [...r.layouts.map((l) => l.filePath), r.filePath];

      const loaders = sources
        .map((fp) => {
          const configPath = fp.replace(/\.(tsx|jsx)$/, ".config.ts");
          const guardPath = fs.existsSync(configPath) ? configPath : fp.replace(/\.jsx$/, ".config.js");
          const resolvedGuardPath = fs.existsSync(guardPath) ? guardPath : fp;
          return `async () => { const m = await import("${resolvedGuardPath.replace(/\\/g, "/")}"); return m?.config?.guards ?? []; }`;
        })
        .join(",\n    ");

      return `  ["${r.urlPattern}", [\n    ${loaders}\n  ]]`;
    })
    .join(",\n");

  const chunkPreloadRegistryCode = buildPreloadMapString(conventionalRoutes, allLayouts);

  const preloadFnCode = `
export async function preloadActiveClientRoute(pathname: string) {
  // Simple match logic against parameters or route patterns
  const pattern = Object.keys(chunkPreloadRegistry).find(p => {
    if (p === pathname) return true;
    const regexStr = p.replace(/:([a-zA-Z0-9_-]+)/g, "([^/]+)").replace(/\\*([a-zA-Z0-9_-]*)/g, "(.*)");
    return new RegExp("^" + regexStr + "$").test(pathname);
  });
  
  const componentsToPreload = pattern ? chunkPreloadRegistry[pattern] : [];
  const preloads = componentsToPreload
    .filter(c => typeof c.preload === "function")
    .map(c => c.preload());
  
  await Promise.all(preloads);
}
`.trim();

  const code = `
// @ts-nocheck
// auto-generated by anaemia - do not edit!!
import { lazy } from "solid-js";
import { Route } from "@solidjs/router";
import { RouteDataController } from "@anaemia/core";

${rootImport}

${rootWrapperCode}

${routeImports}

${layoutImports}

${chunkPreloadRegistryCode}

${preloadFnCode}

export const serverLoaderRegistry = new Map([\n${registryEntries}\n]);

export const serverGuardRegistry = new Map([\n${guardRegistryEntries}\n]);

export default function AnaemiaRoutes() {
  return (
${finalJsx}
  );
}
`.trimStart();

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outPath, code);
  return outPath;
}
