import { walkAst } from "../ast-walker.js";
import { prop, child } from "../ast-utils.js";
import type { AstNode } from "../ast-walker.js";
import type { AnalyzerDiagnostic, ParsedAnalyzerFile } from "../types.js";

const SERVER_FILE_PATTERNS = [/\.server\.(ts|tsx|js|jsx)$/, /server\//, /\/api\//, /_route\.(ts|tsx|js|jsx)$/];

function isClientFile(filePath: string): boolean {
  return !SERVER_FILE_PATTERNS.some((p) => p.test(filePath));
}

const ALWAYS_SAFE = new Set(["NODE_ENV", "MODE", "DEV", "PROD"]);

function startLine(node: AstNode): number | undefined {
  const loc = prop<{ start: { line: number } } | undefined>(node, "loc");
  return loc?.start.line;
}

export function checkEnvAccess(file: ParsedAnalyzerFile): AnalyzerDiagnostic[] {
  if (!file.program || !isClientFile(file.relativePath)) return [];

  const diagnostics: AnalyzerDiagnostic[] = [];

  walkAst(file.program, {
    enter(node: AstNode) {
      if (node.type !== "MemberExpression") return;

      const obj = child(node, "object");
      const propNode = child(node, "property");
      if (!obj || !propNode) return;

      // process.env
      if (
        obj.type === "Identifier" &&
        prop<string>(obj, "name") === "process" &&
        propNode.type === "Identifier" &&
        prop<string>(propNode, "name") === "env"
      ) {
        diagnostics.push({
          code: "PROCESS_ENV_ACCESS",
          severity: "warning",
          message: "using process.env is not recommended in anaemia apps. Use import.meta.env instead.",
          filePath: file.relativePath,
          line: startLine(node),
          help: "replace process.env with import.meta.env and ensure client variables are prefixed with PUBLIC_",
        });
        return;
      }

      // import.meta.env.KEY
      if (obj.type === "MemberExpression") {
        const innerObj = child(obj, "object");
        const innerProp = child(obj, "property");
        if (
          innerObj?.type === "MetaProperty" &&
          innerProp?.type === "Identifier" &&
          prop<string>(innerProp, "name") === "env" &&
          propNode.type === "Identifier"
        ) {
          const envKey = prop<string>(propNode, "name");
          if (!envKey.startsWith("PUBLIC_") && !ALWAYS_SAFE.has(envKey)) {
            diagnostics.push({
              code: "ENV_NOT_PUBLIC",
              severity: "warning",
              message: `import.meta.env.${envKey} is not prefixed with PUBLIC_ and will be undefined on the client`,
              filePath: file.relativePath,
              line: startLine(node),
              help: `rename to PUBLIC_${envKey} or move this code to a .server.ts file`,
            });
          }
        }
      }
    },
  });

  return diagnostics;
}
