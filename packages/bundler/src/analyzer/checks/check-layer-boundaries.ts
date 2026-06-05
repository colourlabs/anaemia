import { walkAst } from "../ast-walker.js";
import { prop, child } from "../ast-utils.js";
import type { AstNode } from "../ast-walker.js";
import type { AnalyzerDiagnostic, ParsedAnalyzerFile } from "../types.js";

// layer order - a layer may only import from layers below it
const LAYER_ORDER = ["app", "features", "entities", "shared"] as const;

type Layer = (typeof LAYER_ORDER)[number];

// alias prefix → layer
const ALIAS_TO_LAYER: Record<string, Layer> = {
  "@app": "app",
  "@features": "features",
  "@entities": "entities",
  "@shared": "shared",
};

// src dir name → layer
const DIR_TO_LAYER: Record<string, Layer> = {
  app: "app",
  features: "features",
  entities: "entities",
  shared: "shared",
};

function layerOf(filePath: string): Layer | null {
  const normalized = filePath.replace(/\\/g, "/");
  for (const [dir, layer] of Object.entries(DIR_TO_LAYER)) {
    if (normalized.includes(`/src/${dir}/`)) return layer;
  }
  return null;
}

function layerOfImport(value: string): Layer | null {
  for (const [prefix, layer] of Object.entries(ALIAS_TO_LAYER)) {
    if (value.startsWith(`${prefix}/`) || value === prefix) return layer;
  }
  return null;
}

function importedLayer(value: string): Layer | null {
  return layerOfImport(value);
}

function isAllowedImport(fromLayer: Layer, toLayer: Layer): boolean {
  const fromIdx = LAYER_ORDER.indexOf(fromLayer);
  const toIdx = LAYER_ORDER.indexOf(toLayer);
  // may only import from layers with a higher index (lower in the stack)
  return toIdx > fromIdx;
}

function isEntityInternalImport(value: string): boolean {
  // importing from @entities/something/api/... instead of @entities/something/index
  if (!value.startsWith("@entities/")) return false;
  const rest = value.slice("@entities/".length);
  const parts = rest.split("/");
  // @entities/user = fine (index), @entities/user/anything = internal
  return parts.length > 1;
}

function startLine(node: AstNode): number | undefined {
  const loc = prop<{ start: { line: number } } | undefined>(node, "loc");
  return loc?.start.line;
}

function getImportValue(node: AstNode): string | null {
  const isDynamic = node.type === "ImportExpression";
  if (isDynamic) {
    return prop<string>(child(node, "source") ?? node, "value");
  }
  const source = child(node, "source");
  if (!source) return null;
  return prop<string>(source, "value");
}

export function checkLayerBoundaries(file: ParsedAnalyzerFile): AnalyzerDiagnostic[] {
  if (!file.program) return [];

  const fromLayer = layerOf(file.filePath);
  if (!fromLayer) return [];

  const diagnostics: AnalyzerDiagnostic[] = [];

  walkAst(file.program, {
    enter(node: AstNode) {
      const isImport =
        node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration" ||
        node.type === "ImportExpression";

      if (!isImport) return;

      const value = getImportValue(node);
      if (!value) return;

      // cross-entity internal access - entity reaching into another entity's internals
      if (fromLayer === "entities" && isEntityInternalImport(value)) {
        const rest = value.slice("@entities/".length);
        const entityName = rest.split("/")[0];
        const fileEntity = file.filePath.replace(/\\/g, "/").match(/\/entities\/([^/]+)\//)?.[1];

        // only flag if it's a different entity
        if (entityName !== fileEntity) {
          diagnostics.push({
            code: "LAYER_BOUNDARY_VIOLATION",
            severity: "error",
            message: `"${file.relativePath}" imports from internal path "${value}" — use the entity's index instead`,
            filePath: file.relativePath,
            line: startLine(node),
            help: `replace with "@entities/${entityName}"`,
          });
          return;
        }
      }

      const toLayer = importedLayer(value);
      if (!toLayer) return;
      if (toLayer === fromLayer) return; // same layer is fine

      if (!isAllowedImport(fromLayer, toLayer)) {
        diagnostics.push({
          code: "LAYER_BOUNDARY_VIOLATION",
          severity: "error",
          message: `"${file.relativePath}" (${fromLayer}) may not import from ${toLayer} layer`,
          filePath: file.relativePath,
          line: startLine(node),
          help: `${fromLayer} may only import from: ${LAYER_ORDER.slice(LAYER_ORDER.indexOf(fromLayer) + 1).join(", ")}`,
        });
      }
    },
  });

  return diagnostics;
}
