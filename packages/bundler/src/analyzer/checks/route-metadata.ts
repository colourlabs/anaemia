import { walkAst } from "../ast-walker.js";
import { prop, child, children } from "../ast-utils.js";
import type { AstNode } from "../ast-walker.js";
import type { ParsedAnalyzerFile } from "../types.js";

export interface RouteMetadata {
  filePath: string;
  hasServerFunctions: boolean;
  hasLoader: boolean;
  hasGuard: boolean;
  isStatic: boolean;
  serverFunctionIds: string[];
  params: string[];
}

export function extractRouteMetadata(file: ParsedAnalyzerFile): RouteMetadata {
  if (!file.program) {
    return {
      filePath: file.relativePath,
      hasServerFunctions: false,
      hasLoader: false,
      hasGuard: false,
      isStatic: true,
      serverFunctionIds: [],
      params: extractParamsFromPath(file.relativePath),
    };
  }

  let hasServerFunctions = false;
  let hasLoader = false;
  let hasGuard = false;
  const serverFunctionIds: string[] = [];

  walkAst(file.program, {
    enter(node: AstNode) {
      if (node.type === "ImportDeclaration") {
        const source = child(node, "source");
        if (source && /\.server/.test(prop<string>(source, "value"))) {
          hasServerFunctions = true;
        }
        return;
      }

      if (node.type === "ExportNamedDeclaration") {
        const decl = child(node, "declaration");
        if (decl?.type === "VariableDeclaration") {
          for (const d of children(decl, "declarations")) {
            const id = child(d, "id");
            if (!id) continue;
            const name = prop<string>(id, "name");
            if (name === "loader") hasLoader = true;
            if (name === "guard") hasGuard = true;
          }
        }
        return;
      }

      if (node.type === "CallExpression") {
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
          if (typeof value === "string") serverFunctionIds.push(value);
        }
      }
    },
  });

  return {
    filePath: file.relativePath,
    hasServerFunctions,
    hasLoader,
    hasGuard,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    isStatic: !hasServerFunctions && !hasLoader && !hasGuard,
    serverFunctionIds,
    params: extractParamsFromPath(file.relativePath),
  };
}

function extractParamsFromPath(filePath: string): string[] {
  return [...filePath.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
}
