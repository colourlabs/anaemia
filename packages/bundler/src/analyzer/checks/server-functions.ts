import { walkAst } from "../ast-walker.js";
import { prop, child, children } from "../ast-utils.js";
import type { AstNode } from "../ast-walker.js";
import type { AnalyzerDiagnostic, ParsedAnalyzerFile } from "../types.js";

export function collectServerFunctionDefinitions(
  files: ParsedAnalyzerFile[],
): Map<string, { filePath: string; line?: number }> {
  const definitions = new Map<string, { filePath: string; line?: number }>();

  for (const file of files) {
    if (!file.program) continue;
    walkAst(file.program, {
      enter(node: AstNode) {
        if (node.type !== "CallExpression") return;
        const callee = child(node, "callee");
        const args = children(node, "arguments");
        const idArg = args[1];

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!idArg) return;

        if (
          callee?.type === "Identifier" &&
          prop<string>(callee, "name") === "runOnServer" &&
          idArg.type === "Literal"
        ) {
          const value = prop<unknown>(idArg, "value");
          if (typeof value === "string") {
            definitions.set(value, {
              filePath: file.relativePath,
              line: prop<{ start: { line: number } } | undefined>(node, "loc")?.start.line,
            });
          }
        }
      },
    });
  }

  return definitions;
}

export function collectServerFunctionImports(files: ParsedAnalyzerFile[]): Set<string> {
  const imports = new Set<string>();

  for (const file of files) {
    if (!file.program) continue;
    walkAst(file.program, {
      enter(node: AstNode) {
        if (node.type !== "ImportDeclaration") return;
        const source = child(node, "source");
        if (!source || !/\.server/.test(prop<string>(source, "value"))) return;
        for (const specifier of children(node, "specifiers")) {
          if (specifier.type === "ImportSpecifier") {
            const local = child(specifier, "local");
            if (local) imports.add(prop<string>(local, "name"));
          }
        }
      },
    });
  }

  return imports;
}

export function checkUnusedServerFunctions(files: ParsedAnalyzerFile[]): AnalyzerDiagnostic[] {
  const definitions = collectServerFunctionDefinitions(files);
  const imports = collectServerFunctionImports(files);
  const diagnostics: AnalyzerDiagnostic[] = [];

  for (const [id, { filePath, line }] of definitions) {
    if (!imports.has(id)) {
      diagnostics.push({
        code: "UNUSED_SERVER_FUNCTION",
        severity: "info",
        message: `server function "${id}" is defined but never imported`,
        filePath,
        line,
        help: `remove it or check if it's being imported under a different name`,
      });
    }
  }

  return diagnostics;
}
