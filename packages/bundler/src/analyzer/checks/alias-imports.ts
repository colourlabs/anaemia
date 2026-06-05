import { walkAst } from "../ast-walker.js";
import { prop, child } from "../ast-utils.js";
import type { AstNode } from "../ast-walker.js";
import type { AnalyzerDiagnostic, ParsedAnalyzerFile } from "../types.js";
import path from "node:path";

const ALIAS_PREFIXES = ["~", "@shared", "@features", "@routes", "@entities", "@app"];
const RELATIVE_ESCAPE = /\.\.[/\\]/;

function startLine(node: AstNode): number | undefined {
  const loc = prop<{ start: { line: number } } | undefined>(node, "loc");
  return loc?.start.line;
}

function getImportSource(node: AstNode): string | null {
  const source = child(node, "source");
  if (!source) return null;
  return prop<string>(source, "value");
}

function suggestAlias(value: string, fromFile: string): string | null {
  const segments: [string, string][] = [
    ["src/features/", "@features/"],
    ["src/app/", "@app/"],
    ["src/shared/", "@shared/"],
    ["src/routes/", "@routes/"],
    ["src/entities/", "@entities/"],
    ["src/", "~/"],
  ];

  const resolved = path.resolve(path.dirname(fromFile), value).replace(/\\/g, "/");

  for (const [segment, alias] of segments) {
    const needle = `/${segment}`;
    const idx = resolved.lastIndexOf(needle);
    if (idx !== -1) {
      const rest = resolved.slice(idx + needle.length);
      return `${alias}${rest}`.replace(/\/+/g, "/");
    }
  }

  return null;
}

export function checkAliasImports(file: ParsedAnalyzerFile): AnalyzerDiagnostic[] {
  if (!file.program) return [];
  const diagnostics: AnalyzerDiagnostic[] = [];

  walkAst(file.program, {
    enter(node: AstNode) {
      // cover: import '...', export from '...', dynamic import('...')
      const isStaticImport = node.type === "ImportDeclaration";
      const isReexport = node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration";
      const isDynamic = node.type === "ImportExpression";

      if (!isStaticImport && !isReexport && !isDynamic) return;

      const value = isDynamic
        ? prop<string>(child(node, "source") ?? node, "value") // dynamic: argument
        : getImportSource(node);

      if (!value) return;

      // already using an alias - good
      if (ALIAS_PREFIXES.some((a) => value.startsWith(a))) return;

      // only warn on relative paths that look like they escape into aliased dirs
      if (!RELATIVE_ESCAPE.test(value)) return;

      const suggestion = suggestAlias(value, file.filePath);

      diagnostics.push({
        code: "PREFER_ALIAS_IMPORT",
        severity: "warning",
        message: `relative import "${value}" could use a path alias instead`,
        filePath: file.relativePath,
        line: startLine(node),
        help: suggestion ? `replace with "${suggestion}"` : `use one of: ${ALIAS_PREFIXES.join(", ")}`,
      });
    },
  });

  return diagnostics;
}
