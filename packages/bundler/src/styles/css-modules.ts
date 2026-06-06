import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import { walkAst } from "../analyzer/ast-walker.js";
import { child, children, prop } from "../analyzer/ast-utils.js";
import type { AnalyzerDiagnostic, ParsedAnalyzerFile } from "../analyzer/types.js";

const CSS_MODULE_REGEX = /\.module\.(css|scss|sass)$/;
const CLASS_NAME_REGEX = /(?<![\w-])\.([_a-zA-Z][_a-zA-Z0-9-]*)/g;
const IDENTIFIER_REGEX = /^[$A-Z_a-z][$\w]*$/;

export type CssModuleTypeMode = boolean | "emit" | "check" | undefined;

export type CssModuleInfo = {
  filePath: string;
  relativePath: string;
  classes: string[];
  usedClasses: string[];
  unusedClasses: string[];
  importers: string[];
};

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function collectCssModuleFiles(appRoot: string): string[] {
  return glob.sync("src/**/*.module.{css,scss,sass}", {
    cwd: appRoot,
    absolute: true,
    nodir: true,
    posix: true,
    ignore: ["node_modules/**", "dist/**", ".anaemia/**"],
  });
}

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractCssModuleClasses(source: string): string[] {
  const withoutComments = stripCssComments(source);
  return uniqueSorted([...withoutComments.matchAll(CLASS_NAME_REGEX)].map((match) => match[1]).filter(Boolean));
}

function resolveCssModuleImport(importerPath: string, source: string): string | null {
  if (!source.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(importerPath), source);
  const candidates = CSS_MODULE_REGEX.test(resolved)
    ? [resolved]
    : [".module.css", ".module.scss", ".module.sass"].map((ext) => `${resolved}${ext}`);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function declarationForCssModule(classes: string[]): string {
  const defaultEntries = classes.map((className) => `  readonly "${className}": string;`).join("\n");
  const namedExports = classes
    .filter((className) => IDENTIFIER_REGEX.test(className))
    .map((className) => `export const ${className}: string;`)
    .join("\n");

  return ["declare const classes: {", defaultEntries, "};", "", "export default classes;", namedExports, ""]
    .filter((line) => line !== "")
    .join("\n");
}

export function syncCssModuleTypes(appRoot: string, mode: CssModuleTypeMode): AnalyzerDiagnostic[] {
  const effectiveMode = mode === true ? "emit" : mode;
  if (effectiveMode === false) return [];
  if (effectiveMode === undefined) return [];

  const diagnostics: AnalyzerDiagnostic[] = [];

  const generatedDir = path.resolve(appRoot, ".anaemia/generated/css-modules");

  for (const filePath of collectCssModuleFiles(appRoot)) {
    const source = fs.readFileSync(filePath, "utf-8");
    const classes = extractCssModuleClasses(source);
    const declaration = declarationForCssModule(classes);

    const relativeOriginalPath = path.relative(appRoot, filePath);
    const declarationPath = path.resolve(generatedDir, `${relativeOriginalPath}.d.ts`);
    const relativeDeclarationPath = normalizePath(path.relative(appRoot, declarationPath));

    const declarationDir = path.dirname(declarationPath);
    if (!fs.existsSync(declarationDir)) {
      fs.mkdirSync(declarationDir, { recursive: true });
    }

    const existing = fs.existsSync(declarationPath) ? fs.readFileSync(declarationPath, "utf-8") : null;

    if (effectiveMode === "check") {
      if (existing !== declaration) {
        diagnostics.push({
          code: "CSS_MODULE_TYPES_STALE",
          severity: "error",
          filePath: relativeDeclarationPath,
          message: `${relativeDeclarationPath} is missing or stale`,
          help: 'run anaemia with styles.typedModules set to true or "emit" to regenerate CSS module declarations.',
        });
      }
      continue;
    }

    if (existing !== declaration) {
      fs.writeFileSync(declarationPath, declaration);
    }
  }

  return diagnostics;
}

function collectCssModuleImports(file: ParsedAnalyzerFile): Map<string, string> {
  const imports = new Map<string, string>();
  if (!file.program) return imports;

  walkAst(file.program, {
    enter(node, _parent, controller) {
      if (node.type !== "ImportDeclaration") return;

      const sourceNode = child(node, "source");
      const source = sourceNode ? prop<unknown>(sourceNode, "value") : undefined;
      if (typeof source !== "string") return;

      const resolved = resolveCssModuleImport(file.filePath, source);
      if (!resolved) return;

      for (const specifier of children(node, "specifiers")) {
        if (specifier.type === "ImportDefaultSpecifier" || specifier.type === "ImportNamespaceSpecifier") {
          const local = child(specifier, "local");
          const localName = local ? prop<unknown>(local, "name") : undefined;
          if (typeof localName === "string") imports.set(localName, resolved);
        }

        if (specifier.type === "ImportSpecifier") {
          const imported = child(specifier, "imported");
          const importedName = imported ? prop<unknown>(imported, "name") : undefined;
          if (typeof importedName === "string") imports.set(importedName, resolved);
        }
      }

      controller.skip();
    },
  });

  return imports;
}

function collectUsedClasses(file: ParsedAnalyzerFile, importedLocals: Map<string, string>): Map<string, Set<string>> {
  const usedByModule = new Map<string, Set<string>>();
  if (!file.program || importedLocals.size === 0) return usedByModule;

  const markUsed = (modulePath: string, className: string) => {
    if (!usedByModule.has(modulePath)) usedByModule.set(modulePath, new Set());
    usedByModule.get(modulePath)!.add(className);
  };

  for (const modulePath of importedLocals.values()) {
    if (!usedByModule.has(modulePath)) usedByModule.set(modulePath, new Set());
  }

  walkAst(file.program, {
    enter(node) {
      if (node.type === "MemberExpression") {
        const object = child(node, "object");
        if (object?.type !== "Identifier") return;

        const modulePath = importedLocals.get(prop<string>(object, "name"));
        if (!modulePath) return;

        const property = child(node, "property");
        if (property?.type === "Identifier") markUsed(modulePath, prop<string>(property, "name"));
        if (property?.type === "Literal") {
          const value = prop<unknown>(property, "value");
          if (typeof value === "string") markUsed(modulePath, value);
        }
        return;
      }

      if (node.type === "VariableDeclarator") {
        const id = child(node, "id");
        const init = child(node, "init");
        if (id?.type !== "ObjectPattern" || init?.type !== "Identifier") return;

        const modulePath = importedLocals.get(prop<string>(init, "name"));
        if (!modulePath) return;

        for (const property of children(id, "properties")) {
          const key = child(property, "key");
          if (key?.type === "Identifier") markUsed(modulePath, prop<string>(key, "name"));
          if (key?.type === "Literal") {
            const value = prop<unknown>(key, "value");
            if (typeof value === "string") markUsed(modulePath, value);
          }
        }
      }
    },
  });

  return usedByModule;
}

export function analyzeCssModules(
  appRoot: string,
  parsedFiles: ParsedAnalyzerFile[],
): {
  cssModules: CssModuleInfo[];
  diagnostics: AnalyzerDiagnostic[];
} {
  const moduleFiles = collectCssModuleFiles(appRoot);
  const classesByModule = new Map<string, string[]>();
  const usedByModule = new Map<string, Set<string>>();
  const importersByModule = new Map<string, Set<string>>();
  const diagnostics: AnalyzerDiagnostic[] = [];

  for (const filePath of moduleFiles) {
    const source = fs.readFileSync(filePath, "utf-8");
    classesByModule.set(filePath, extractCssModuleClasses(source));
  }

  for (const file of parsedFiles) {
    const imports = collectCssModuleImports(file);
    if (imports.size === 0) continue;

    for (const modulePath of imports.values()) {
      if (!importersByModule.has(modulePath)) importersByModule.set(modulePath, new Set());
      importersByModule.get(modulePath)!.add(file.relativePath);
    }

    const fileUsage = collectUsedClasses(file, imports);
    for (const [modulePath, usedClasses] of fileUsage) {
      if (!usedByModule.has(modulePath)) usedByModule.set(modulePath, new Set());
      for (const className of usedClasses) usedByModule.get(modulePath)!.add(className);
    }
  }

  for (const [modulePath, classes] of classesByModule) {
    const classSet = new Set(classes);
    const usedClasses = usedByModule.get(modulePath) ?? new Set<string>();
    const importers = importersByModule.get(modulePath) ?? new Set<string>();
    const relativePath = normalizePath(path.relative(appRoot, modulePath));

    if (importers.size === 0) {
      diagnostics.push({
        code: "CSS_MODULE_UNUSED",
        severity: "warning",
        filePath: relativePath,
        message: `${relativePath} is not imported by any analyzed source file`,
        help: "delete it or import it from a component/route if it is still needed.",
      });
    }

    for (const className of usedClasses) {
      if (!classSet.has(className)) {
        diagnostics.push({
          code: "CSS_MODULE_UNKNOWN_CLASS",
          severity: "warning",
          filePath: relativePath,
          message: `${relativePath} does not define .${className}`,
          help: "check the CSS module class name or update the stylesheet.",
        });
      }
    }

    for (const className of classes) {
      if (importers.size > 0 && !usedClasses.has(className)) {
        diagnostics.push({
          code: "CSS_MODULE_UNUSED_CLASS",
          severity: "warning",
          filePath: relativePath,
          message: `.${className} is defined in ${relativePath} but was not used by analyzed imports`,
          help: "remove the class or reference it from the imported CSS module object.",
        });
      }
    }
  }

  return {
    cssModules: [...classesByModule.entries()].map(([filePath, classes]) => {
      const usedClasses = uniqueSorted(usedByModule.get(filePath) ?? []);
      return {
        filePath: normalizePath(path.relative(appRoot, filePath)),
        relativePath: normalizePath(path.relative(appRoot, filePath)),
        classes,
        usedClasses,
        unusedClasses: classes.filter((className) => !usedClasses.includes(className)),
        importers: uniqueSorted(importersByModule.get(filePath) ?? []),
      };
    }),
    diagnostics,
  };
}
