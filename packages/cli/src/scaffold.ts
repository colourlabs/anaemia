import fs from "node:fs";
import path from "node:path";
import { toCamelCase, toKebabCase, toPascalCase } from "./utils/casing.js";

// TODO: refactor this to use logger instead

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
};

const fmt = {
  dim: (s: string) => `${c.dim}${s}${c.reset}`,
  green: (s: string) => `${c.green}${s}${c.reset}`,
  cyan: (s: string) => `${c.cyan}${s}${c.reset}`,
  yellow: (s: string) => `${c.yellow}${s}${c.reset}`,
};

function printTree(label: string, icon: string, lines: string[]) {
  console.log(`\n${icon} ${fmt.green(label)}`);
  for (const line of lines) console.log(fmt.dim("  ") + line);
  console.log();
}

function treeFile(name: string) {
  return fmt.cyan(name);
}

function detectTs(appRoot: string) {
  return fs.existsSync(path.join(appRoot, "tsconfig.json"));
}

export function scaffoldFeature(rawName: string, appRoot: string) {
  const folderName = toKebabCase(rawName);
  const componentName = toPascalCase(rawName);
  const camelName = toCamelCase(rawName);

  const isTypeScript = detectTs(appRoot);
  const ext = isTypeScript ? "tsx" : "jsx";
  const scriptExt = isTypeScript ? "ts" : "js";

  const featureDir = path.resolve(appRoot, `./src/features/${folderName}`);

  for (const dir of [
    path.join(featureDir, "components"),
    path.join(featureDir, "hooks"),
    path.join(featureDir, "api"),
    path.join(featureDir, "store"),
  ])
    fs.mkdirSync(dir, { recursive: true });

  // component
  const componentContent = isTypeScript
    ? `import type { JSX } from "solid-js";
import styles from "./${componentName}.module.scss";

interface ${componentName}Props {
  children?: JSX.Element;
  data?: unknown;
}

export function ${componentName}(props: ${componentName}Props) {
  return (
    <div class={styles.wrapper}>
      {props.children}
    </div>
  );
}
`
    : `import styles from "./${componentName}.module.scss";

export function ${componentName}(props) {
  return (
    <div class={styles.wrapper}>
      {props.children}
    </div>
  );
}
`;

  // server action
  const actionsContent = isTypeScript
    ? `// server-side logic — DO NOT import UI code here

export async function ${camelName}Query(input: unknown) {
  // TODO: implement server-side logic
  return { ok: true };
}
`
    : `// server-side logic — DO NOT import UI code here

export async function ${camelName}Query(input) {
  // TODO: implement server-side logic
  return { ok: true };
}
`;

  // hook
  const hookContent = isTypeScript
    ? `import { createServerResource } from "@anaemia/core";
import { ${camelName}Action } from "../index.js";

export function use${componentName}() {
  const [data] = createServerResource(() => undefined, ${camelName}Action);
  return { data };
}
`
    : `import { createServerResource } from "@anaemia/core";
import { ${camelName}Action } from "../index.js";

export function use${componentName}() {
  const [data] = createServerResource(() => undefined, ${camelName}Action);
  return { data };
}
`;

  // index
  const indexContent = isTypeScript
    ? `import { runOnServer, registerRpcPolicy } from "@anaemia/core";
import { ${camelName}Query } from "./api/actions.server.js";

export const ${camelName}Action = runOnServer(async (input: unknown) => {
  return await ${camelName}Query(input);
});

// /_rpc is deny-by-default: the action is callable from the browser only after
// a policy is registered here. replace allow() with a real authorization check.
registerRpcPolicy(${camelName}Action.id, { allow: () => true });

export { ${componentName} } from "./components/${componentName}.js";
export { use${componentName} } from "./hooks/use${componentName}.js";
`
    : `import { runOnServer, registerRpcPolicy } from "@anaemia/core";
import { ${camelName}Query } from "./api/actions.server.js";

export const ${camelName}Action = runOnServer(async (input) => {
  return await ${camelName}Query(input);
});

// /_rpc is deny-by-default: the action is callable from the browser only after
// a policy is registered here. replace allow() with a real authorization check.
registerRpcPolicy(${camelName}Action.id, { allow: () => true });

export { ${componentName} } from "./components/${componentName}.js";
export { use${componentName} } from "./hooks/use${componentName}.js";
`;

  fs.writeFileSync(path.join(featureDir, `components/${componentName}.${ext}`), componentContent, "utf8");
  fs.writeFileSync(
    path.join(featureDir, `components/${componentName}.module.scss`),
    `.wrapper {\n  display: block;\n}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(featureDir, `api/actions.server.${scriptExt}`), actionsContent, "utf8");
  fs.writeFileSync(path.join(featureDir, `hooks/use${componentName}.${scriptExt}`), hookContent, "utf8");
  fs.writeFileSync(path.join(featureDir, `index.${scriptExt}`), indexContent, "utf8");

  printTree(`src/features/${folderName}/`, "🎯", [
    `├── api/`,
    `│   └── ${treeFile(`actions.server.${scriptExt}`)}`,
    `├── components/`,
    `│   ├── ${treeFile(`${componentName}.${ext}`)}`,
    `│   └── ${treeFile(`${componentName}.module.scss`)}`,
    `├── hooks/`,
    `│   └── ${treeFile(`use${componentName}.${scriptExt}`)}`,
    `├── store/`,
    `└── ${treeFile(`index.${scriptExt}`)}`,
  ]);
}

export function scaffoldEntity(rawName: string, appRoot: string) {
  const folderName = toKebabCase(rawName);
  const pascalName = toPascalCase(rawName);
  const camelName = toCamelCase(rawName);

  const isTypeScript = detectTs(appRoot);
  const scriptExt = isTypeScript ? "ts" : "js";

  const entityDir = path.resolve(appRoot, `./src/entities/${folderName}`);

  for (const dir of [path.join(entityDir, "api"), path.join(entityDir, "store"), path.join(entityDir, "components")])
    fs.mkdirSync(dir, { recursive: true });

  // types
  const typesContent = isTypeScript
    ? `export interface ${pascalName} {
  id: string;
  // TODO: define ${pascalName} shape
}
`
    : null;

  // api
  const apiContent = isTypeScript
    ? `import type { ${pascalName} } from "../types.js";

export const get${pascalName} = async (id: string): Promise<${pascalName}> => {
  // TODO: implement data fetching
  throw new Error("get${pascalName} not implemented");
};
`
    : `export const get${pascalName} = async (id) => {
  // TODO: implement data fetching
  throw new Error("get${pascalName} not implemented");
};
`;

  const apiIndexContent = `export { get${pascalName} } from "./get${pascalName}.js";\n`;

  // store
  const storeContent = isTypeScript
    ? `import { createSignal } from "solid-js";
import type { ${pascalName} } from "../types.js";

const [${camelName}, set${pascalName}] = createSignal<${pascalName} | null>(null);

export { ${camelName}, set${pascalName} };
`
    : `import { createSignal } from "solid-js";

const [${camelName}, set${pascalName}] = createSignal(null);

export { ${camelName}, set${pascalName} };
`;

  // index
  const indexContent = isTypeScript
    ? `export type { ${pascalName} } from "./types.js";
export * from "./api/index.js";
export * from "./store/${camelName}Store.js";
`
    : `export * from "./api/index.js";
export * from "./store/${camelName}Store.js";
`;

  if (isTypeScript && typesContent) {
    fs.writeFileSync(path.join(entityDir, `types.${scriptExt}`), typesContent, "utf8");
  }
  fs.writeFileSync(path.join(entityDir, `api/get${pascalName}.${scriptExt}`), apiContent, "utf8");
  fs.writeFileSync(path.join(entityDir, `api/index.${scriptExt}`), apiIndexContent, "utf8");
  fs.writeFileSync(path.join(entityDir, `store/${camelName}Store.${scriptExt}`), storeContent, "utf8");
  fs.writeFileSync(path.join(entityDir, `index.${scriptExt}`), indexContent, "utf8");

  const treeLines = [
    `├── api/`,
    `│   ├── ${treeFile(`get${pascalName}.${scriptExt}`)}`,
    `│   └── ${treeFile(`index.${scriptExt}`)}`,
    `├── components/`,
    `├── store/`,
    `│   └── ${treeFile(`${camelName}Store.${scriptExt}`)}`,
    ...(isTypeScript ? [`├── ${treeFile(`types.${scriptExt}`)}`] : []),
    `└── ${treeFile(`index.${scriptExt}`)}`,
  ];

  printTree(`src/entities/${folderName}/`, "🧩", treeLines);
}

interface GeneratorOptions {
  logger: { error: (m: string) => void; success: (m: string) => void };
  pc: { dim: (s: string) => string; cyan: (s: string) => string };
}

export function generateSharedComponent(appRoot: string, componentName: string, { logger }: GeneratorOptions) {
  const kebabFolder = toKebabCase(componentName);
  const pascalName = toPascalCase(componentName);

  const isTypeScript = detectTs(appRoot);
  const ext = isTypeScript ? "tsx" : "jsx";

  const compDir = path.resolve(appRoot, `./src/shared/components/${kebabFolder}`);

  if (fs.existsSync(compDir)) {
    logger.error(`generation halted: shared component "${kebabFolder}" already exists.`);
    return false;
  }

  fs.mkdirSync(compDir, { recursive: true });

  const componentContent = isTypeScript
    ? `import { children } from "solid-js";
import type { JSX } from "solid-js";
import styles from "./${pascalName}.module.scss";

interface ${pascalName}Props {
  children?: JSX.Element;
}

export function ${pascalName}(props: ${pascalName}Props) {
  const resolved = children(() => props.children);
  return (
    <div class={styles.base}>
      {resolved()}
    </div>
  );
}
`
    : `import { children } from "solid-js";
import styles from "./${pascalName}.module.scss";

export function ${pascalName}(props) {
  const resolved = children(() => props.children);
  return (
    <div class={styles.base}>
      {resolved()}
    </div>
  );
}
`;

  fs.writeFileSync(path.join(compDir, `${pascalName}.${ext}`), componentContent, "utf8");
  fs.writeFileSync(path.join(compDir, `${pascalName}.module.scss`), `.base {\n  display: inline-block;\n}\n`, "utf8");

  printTree(`src/shared/components/${kebabFolder}/`, "🌍", [
    `├── ${treeFile(`${pascalName}.${ext}`)}`,
    `└── ${treeFile(`${pascalName}.module.scss`)}`,
  ]);

  return true;
}

export function scaffoldPage(rawName: string, appRoot: string) {
  const isTypeScript = detectTs(appRoot);
  const ext = isTypeScript ? "tsx" : "jsx";
  const scriptExt = isTypeScript ? "ts" : "js";

  const segments = rawName.replace(/\\/g, "/").split("/");
  const fileName = segments[segments.length - 1];
  const dirSegments = segments.slice(0, -1);

  const routesDir = path.resolve(appRoot, "./src/routes");
  const pageDir = dirSegments.length > 0 ? path.join(routesDir, ...dirSegments) : routesDir;
  const pagePath = path.join(pageDir, `${fileName}.${ext}`);

  if (fs.existsSync(pagePath)) {
    console.error(fmt.yellow(`[anaemia] generation halted: page "${rawName}" already exists.`));
    process.exit(1);
  }

  fs.mkdirSync(pageDir, { recursive: true });

  const componentName =
    toPascalCase(
      fileName
        .replace(/^\[\.\.\./, "")
        .replace(/^\[/, "")
        .replace(/\]$/, ""),
    ) + "Page";

  const urlPattern =
    "/" +
    segments
      .map((s) => {
        if (s.startsWith("[...") && s.endsWith("]")) return `*${s.slice(4, -1)}`;
        if (s.startsWith("[") && s.endsWith("]")) return `:${s.slice(1, -1)}`;
        return s;
      })
      .join("/");

  const isCatchAll = fileName.startsWith("[...");
  const isDynamic = fileName.startsWith("[") && !isCatchAll;
  const paramName = isDynamic ? fileName.slice(1, -1) : isCatchAll ? fileName.slice(4, -1) : null;

  const typesContent = isTypeScript
    ? `export interface ${componentName}LoaderData {\n  // TODO: define loader return shape\n}\n`
    : null;

  const componentContent = isTypeScript
    ? `import type { ${componentName}LoaderData } from "./${fileName}.types.js";
import { useLoaderData } from "@anaemia/core";

// route: ${urlPattern}
${paramName ? `// param:  ${paramName}` : ""}
export async function loader({ params }: { params: Record<string, string>; request: Request }) {
  // TODO: fetch data here
  return {} satisfies ${componentName}LoaderData;
}

export default function ${componentName}() {
  const data = useLoaderData<${componentName}LoaderData>();

  return (
    <main>
      <h1>${componentName}</h1>
    </main>
  );
}
`
    : `import { useLoaderData } from "@anaemia/core";

// route: ${urlPattern}
${paramName ? `// param:  ${paramName}` : ""}
export async function loader({ params }) {
  // TODO: fetch data here
  return {};
}

export default function ${componentName}() {
  const data = useLoaderData();

  return (
    <main>
      <h1>${componentName}</h1>
    </main>
  );
}
`;

  fs.writeFileSync(pagePath, componentContent, "utf8");

  if (isTypeScript && typesContent) {
    fs.writeFileSync(path.join(pageDir, `${fileName}.types.${scriptExt}`), typesContent, "utf8");
  }

  const treeLines = isTypeScript
    ? [`├── ${treeFile(`${fileName}.${ext}`)}`, `└── ${treeFile(`${fileName}.types.${scriptExt}`)}`]
    : [`└── ${treeFile(`${fileName}.${ext}`)}`];

  printTree(`src/routes/${rawName.split("/").slice(0, -1).join("/") || ""}`, "📄", treeLines);
}

export function scaffoldHook(rawName: string, appRoot: string) {
  const isTypeScript = detectTs(appRoot);
  const ext = isTypeScript ? "ts" : "js";

  const segments = rawName.replace(/\\/g, "/").split("/");
  const isScoped = segments.length > 1;
  const rawHookName = segments[segments.length - 1];
  const scopeName = isScoped ? segments[0] : null;

  const hookName = rawHookName.startsWith("use") ? rawHookName : `use${toPascalCase(rawHookName)}`;

  // resolve destination: feature hook, entity hook, or shared
  let hookDir: string;
  let indexPath: string | null = null;

  if (isScoped) {
    const featureDir = path.resolve(appRoot, `./src/features/${toKebabCase(scopeName!)}`);
    const entityDir = path.resolve(appRoot, `./src/entities/${toKebabCase(scopeName!)}`);

    if (fs.existsSync(featureDir)) {
      hookDir = path.join(featureDir, "hooks");
      indexPath = path.resolve(featureDir, `index.${ext}`);
    } else if (fs.existsSync(entityDir)) {
      hookDir = path.join(entityDir, "hooks");
      indexPath = path.resolve(entityDir, `index.${ext}`);
    } else {
      console.error(fmt.yellow(`[anaemia] "${scopeName}" is not a known feature or entity.`));
      process.exit(1);
    }
  } else {
    hookDir = path.resolve(appRoot, "./src/shared/hooks");
  }

  const hookPath = path.join(hookDir, `${hookName}.${ext}`);

  if (fs.existsSync(hookPath)) {
    console.error(fmt.yellow(`[anaemia] generation halted: hook "${hookName}" already exists.`));
    process.exit(1);
  }

  fs.mkdirSync(hookDir, { recursive: true });

  const hookContent = isTypeScript
    ? `import { createSignal, onMount, onCleanup } from "solid-js";

interface ${toPascalCase(hookName)}Options {
  // TODO: define options
}

interface ${toPascalCase(hookName)}Return {
  // TODO: define return shape
}

export function ${hookName}(options?: ${toPascalCase(hookName)}Options): ${toPascalCase(hookName)}Return {
  const [data, setData]       = createSignal<unknown>(null);
  const [error, setError]     = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    // TODO: setup side effects
  });

  onCleanup(() => {
    // TODO: cleanup
  });

  return { data, error, loading };
}
`
    : `import { createSignal, onMount, onCleanup } from "solid-js";

export function ${hookName}(options) {
  const [data, setData]       = createSignal(null);
  const [error, setError]     = createSignal(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    // TODO: setup side effects
  });

  onCleanup(() => {
    // TODO: cleanup
  });

  return { data, error, loading };
}
`;

  fs.writeFileSync(hookPath, hookContent, "utf8");

  // auto-append export to the owning index if scoped
  if (indexPath && fs.existsSync(indexPath)) {
    const existing = fs.readFileSync(indexPath, "utf8");
    const exportLine = `export { ${hookName} } from "./hooks/${hookName}.js";\n`;
    if (!existing.includes(exportLine)) {
      fs.appendFileSync(indexPath, exportLine, "utf8");
    }
  }

  const location = isScoped
    ? `src/${fs.existsSync(path.resolve(appRoot, `./src/features/${toKebabCase(scopeName!)}`)) ? "features" : "entities"}/${toKebabCase(scopeName!)}/hooks/${hookName}.${ext}`
    : `src/shared/hooks/${hookName}.${ext}`;

  printTree(location, "🪝", [`└── ${treeFile(`${hookName}.${ext}`)}`]);
}
