import fs from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";
import type { ParserOptions } from "oxc-parser";
import type { AnalyzerDiagnostic, AnalyzerFileKind, ParsedAnalyzerFile, ParserError, SourceLocation } from "./types.js";
import { checkEnvAccess } from "./checks/env-access.js";

const DEFAULT_PARSE_OPTIONS: ParserOptions = {
  sourceType: "module",
  astType: "ts",
  range: true,
  preserveParens: false,
};

function offsetToLocation(source: string, offset: number): SourceLocation {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;

  for (let i = 0; i < boundedOffset; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { line, column };
}

function severityFromOxc(error: ParserError): AnalyzerDiagnostic["severity"] {
  if (error.severity === "Error") return "error";
  if (error.severity === "Warning") return "warning";
  return "info";
}

function diagnosticFromOxcError(filePath: string, source: string, error: ParserError): AnalyzerDiagnostic {
  const label = error.labels[0];
  const start = label.start;
  const location = typeof start === "number" ? offsetToLocation(source, start) : undefined;

  return {
    code: "parse",
    severity: severityFromOxc(error),
    message: label.message ? `${error.message}: ${label.message}` : error.message,
    filePath,
    start,
    end: label.end,
    line: location?.line,
    column: location?.column,
    help: error.helpMessage ?? undefined,
    codeframe: error.codeframe ?? undefined,
  };
}

function inferAnalyzerFileKind(appRoot: string, filePath: string): AnalyzerFileKind {
  const relativePath = path.relative(appRoot, filePath).replace(/\\/g, "/");

  if (/^anaemia\.config\.[cm]?[jt]s$/.test(relativePath)) return "config";
  if (relativePath === "src/root.tsx" || relativePath === "src/root.jsx") return "root";
  if (/^src\/routes\/.*\/?_route\.[jt]sx?$/.test(relativePath)) return "server-route";
  if (/^src\/routes\/.*\.[jt]sx$/.test(relativePath)) return "route";
  return "source";
}

export function parseAnalyzerFile(appRoot: string, filePath: string, options: ParserOptions = {}): ParsedAnalyzerFile {
  const source = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(appRoot, filePath).replace(/\\/g, "/");
  const kind = inferAnalyzerFileKind(appRoot, filePath);
  const parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };

  try {
    const result = parseSync(filePath, source, parseOptions);
    const parseDiagnostics = result.errors.map((error) => diagnosticFromOxcError(filePath, source, error));
    const file: ParsedAnalyzerFile = {
      filePath,
      relativePath,
      kind,
      source,
      program: result.program,
      comments: result.comments,
      module: result.module,
      diagnostics: [],
    };

    const diagnostics = [...parseDiagnostics, ...checkEnvAccess(file)];

    return { ...file, diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      filePath,
      relativePath,
      kind,
      source,
      program: null,
      comments: [],
      module: null,
      diagnostics: [{ code: "parse:thrown", severity: "error", message, filePath }],
    };
  }
}
