import { glob } from "glob";
import path from "path";
import { createJiti } from "jiti";
import fs from "node:fs";
import { getAliases } from "../aliases.js";
export function createScanJiti(appRoot) {
    return createJiti(import.meta.url, {
        interopDefault: true,
        alias: getAliases(appRoot),
    });
}
const LAYOUT_FILE = /^_layout\.(tsx|jsx)$/;
const CATCH_ALL_FILE = /^\[\.\.\.(.+?)\]\.(tsx|jsx)$/;
const DYNAMIC_SEGMENT = /^\[(.+?)\]\.(tsx|jsx)$/;
export function scanServerRoutes(appRoot) {
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
export async function scanRoutes(appRoot) {
    const jiti = createScanJiti(appRoot);
    const routesDir = path.resolve(appRoot, "./src/routes");
    const files = glob.sync("**/*.{tsx,jsx}", { cwd: routesDir, posix: true });
    const layoutMap = new Map();
    for (const file of files) {
        const filename = path.basename(file);
        if (LAYOUT_FILE.test(filename)) {
            const dir = path.dirname(file);
            const absolutePath = path.resolve(routesDir, file);
            let layoutGuards = [];
            const configPath = absolutePath
                .replace(/\.(tsx|jsx)$/, ".config.$1")
                .replace(".config.tsx", ".config.ts")
                .replace(".config.jsx", ".config.js");
            const moduleToScan = fs.existsSync(configPath) ? configPath : absolutePath;
            try {
                const layoutModule = jiti.import(moduleToScan);
                if (layoutModule?.config?.guards) {
                    layoutGuards = layoutModule.config.guards;
                }
            }
            catch (err) {
                console.warn(`[anaemia bundler warning]: Failed parsing config flags on layout: ${file}`);
            }
            layoutMap.set(dir, {
                filePath: absolutePath,
                guards: layoutGuards,
            });
        }
    }
    const entries = [];
    for (const file of files) {
        const filename = path.basename(file);
        const dir = path.dirname(file);
        if (LAYOUT_FILE.test(filename))
            continue;
        if (filename.includes(".config."))
            continue;
        const absolutePagePath = path.resolve(routesDir, file);
        const { urlPattern, chunkName, params, type } = parseFilePath(file);
        let pageGuards = [];
        const pageConfigPath = absolutePagePath
            .replace(/\.(tsx|jsx)$/, ".config.$1")
            .replace(".config.tsx", ".config.ts")
            .replace(".config.jsx", ".config.js");
        const pageModuleToScan = fs.existsSync(pageConfigPath) ? pageConfigPath : absolutePagePath;
        try {
            const pageModule = (await jiti.import(pageModuleToScan));
            if (pageModule?.config?.guards) {
                pageGuards = pageModule.config.guards;
            }
        }
        catch (err) {
            // quietly ignore parsing problems for pure components lacking a config wrapper
        }
        const layouts = resolveLayoutChain(dir, layoutMap);
        entries.push({
            urlPattern,
            filePath: absolutePagePath,
            chunkName,
            layouts,
            guards: pageGuards,
            type,
            params,
        });
    }
    return entries;
}
function parseFilePath(file) {
    const segments = file.split("/");
    const urlParts = [];
    const params = [];
    let type = "page";
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isLast = i === segments.length - 1;
        if (isLast) {
            const cleanName = segment.replace(/\.(tsx|jsx)$/, "");
            if (CATCH_ALL_FILE.test(segment)) {
                const match = segment.match(CATCH_ALL_FILE);
                params.push(match[1]);
                urlParts.push(`*`);
                type = "catch-all";
            }
            else if (DYNAMIC_SEGMENT.test(segment)) {
                const match = segment.match(DYNAMIC_SEGMENT);
                params.push(match[1]);
                urlParts.push(`:${match[1]}`);
            }
            else if (cleanName !== "index") {
                urlParts.push(cleanName);
            }
        }
        else {
            if (segment.startsWith("[...") && segment.endsWith("]")) {
                const param = segment.slice(4, -1);
                params.push(param);
                urlParts.push(`*`);
                type = "catch-all";
            }
            else if (segment.startsWith("[") && segment.endsWith("]")) {
                const param = segment.slice(1, -1);
                params.push(param);
                urlParts.push(`:${param}`);
            }
            else {
                urlParts.push(segment);
            }
        }
    }
    const filteredParts = urlParts.filter((part) => part !== "" && part !== ".");
    let urlPattern = "/" + filteredParts.join("/");
    if (urlPattern === "") {
        urlPattern = "/";
    }
    const chunkName = file
        .replace(/\.(tsx|jsx)$/, "")
        .replace(/\[\.\.\.(.+?)\]/g, "catchall-$1")
        .replace(/\[(.+?)\]/g, "param-$1")
        .replace(/\//g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return { urlPattern, chunkName, params, type };
}
function resolveLayoutChain(dir, layoutMap) {
    const layouts = [];
    let current = dir;
    while (true) {
        const layoutEntry = layoutMap.get(current);
        if (layoutEntry)
            layouts.unshift(layoutEntry);
        if (current === "." || current === "")
            break;
        current = path.dirname(current);
    }
    return layouts;
}
