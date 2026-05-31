import type { Comment, EcmaScriptModule, OxcError, Program } from "oxc-parser";
import type { RouteMetadata } from "./checks/route-metadata.js";

type AnalyzerSeverity = "error" | "warning" | "info";

export type AnalyzerDiagnostic = {
  code: string;
  severity: AnalyzerSeverity;
  message: string;
  filePath: string;
  start?: number;
  end?: number;
  line?: number;
  column?: number;
  help?: string;
  codeframe?: string;
};

export type AnalyzerFileKind = "config" | "route" | "server-route" | "root" | "source";

export type SourceLocation = {
  line: number;
  column: number;
};

export type ParsedAnalyzerFile = {
  filePath: string;
  relativePath: string;
  kind: AnalyzerFileKind;
  source: string;
  program: Program | null;
  comments: Comment[];
  module: EcmaScriptModule | null;
  diagnostics: AnalyzerDiagnostic[];
};

export type AnalyzeAppOptions = {
  mode?: string;
  include?: string[];
};

type AnalyzerBuildInfo = {
  mode: string;
  analyzedAt: string;
};

export type AnalyzerResult = {
  appRoot: string;
  build: AnalyzerBuildInfo;
  files: ParsedAnalyzerFile[];
  diagnostics: AnalyzerDiagnostic[];
  routeMetadata: RouteMetadata[];
};

export type ParserError = OxcError;
