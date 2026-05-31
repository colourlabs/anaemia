import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import { parseAnalyzerFile } from "./parser.js";
import type { AnalyzeAppOptions, AnalyzerResult } from "./types.js";

import { checkUnusedServerFunctions } from "./checks/server-functions.js";
import { extractRouteMetadata } from "./checks/route-metadata.js";

const DEFAULT_ANALYZER_PATTERNS = [
  "anaemia.config.{ts,js,mjs,cjs}",
  "src/root.{tsx,jsx}",
  "src/routes/**/*.{ts,tsx,js,jsx}",
  "src/**/*.{ts,tsx,js,jsx}",
];

function uniqueFilePaths(filePaths: string[]): string[] {
  return [...new Set(filePaths.map((filePath) => path.resolve(filePath)))].sort();
}

export function collectAnalyzerFiles(appRoot: string, include = DEFAULT_ANALYZER_PATTERNS): string[] {
  const files = include.flatMap((pattern) =>
    glob.sync(pattern, {
      cwd: appRoot,
      absolute: true,
      nodir: true,
      posix: true,
      ignore: ["node_modules/**", "dist/**", ".anaemia/**"],
    }),
  );

  return uniqueFilePaths(files).filter((filePath) => fs.existsSync(filePath));
}

export async function analyzeApp(appRoot: string, options: AnalyzeAppOptions = {}): Promise<AnalyzerResult> {
  const normalizedRoot = path.resolve(appRoot);
  const files = collectAnalyzerFiles(normalizedRoot, options.include);
  const parsedFiles = files.map((filePath) => parseAnalyzerFile(normalizedRoot, filePath));

  // per-file diagnostics
  const diagnostics = parsedFiles.flatMap((file) => file.diagnostics);

  // cross-file diagnostics
  const unusedServerFnDiagnostics = checkUnusedServerFunctions(parsedFiles);

  // route metadata for manifest
  const routeFiles = parsedFiles.filter((f) => /src\/routes\//.test(f.filePath));
  const routeMetadata = routeFiles.map(extractRouteMetadata);

  return {
    appRoot: normalizedRoot,
    build: {
      mode: options.mode ?? process.env.NODE_ENV ?? "development",
      analyzedAt: new Date().toISOString(),
    },
    files: parsedFiles,
    diagnostics: [...diagnostics, ...unusedServerFnDiagnostics],
    routeMetadata,
  };
}

export { parseAnalyzerFile } from "./parser.js";
export { walkAst } from "./ast-walker.js";
export type {
  AnalyzeAppOptions,
  AnalyzerDiagnostic,
  AnalyzerFileKind,
  AnalyzerResult,
  ParsedAnalyzerFile,
} from "./types.js";
