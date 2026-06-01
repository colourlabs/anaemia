import { walkAst } from "../ast-walker.js";
import type { AnalyzerDiagnostic, ExportSpecifier, ParsedAnalyzerFile } from "../types.js";

export function checkMissingRouteExport(file: ParsedAnalyzerFile): AnalyzerDiagnostic[] {
  if (file.kind !== "route") return [];

  if (!file.program) return [];

  let hasDefaultExport = false;

  walkAst(file.program, {
    enter(node) {
      if (node.type === "ExportDefaultDeclaration") {
        hasDefaultExport = true;
        return;
      }

      if (node.type === "ExportNamedDeclaration") {
        const specifiers = (node as { specifiers?: ExportSpecifier[] }).specifiers ?? [];
        for (const specifier of specifiers) {
          if (specifier.exported?.name === "default") {
            hasDefaultExport = true;
            return;
          }
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!hasDefaultExport) {
    return [
      {
        code: "MISSING_ROUTE_EXPORT",
        severity: "error",
        message: `route file "${file.relativePath}" has no default export`,
        filePath: file.relativePath,
        help: "route files must have a default export of a component e.g. export default function Page() {}",
      },
    ];
  }

  return [];
}
