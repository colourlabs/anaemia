import fs from "node:fs";
import path from "node:path";
import { toCamelCase, toKebabCase, toPascalCase } from "./utils/casing.js";

export function scaffoldFeature(rawName: string, appRoot: string) {
  const folderName = toKebabCase(rawName);
  const componentName = toPascalCase(rawName);
  const camelName = toCamelCase(rawName);

  const isTypeScript = fs.existsSync(path.join(appRoot, "tsconfig.json"));
  const ext = isTypeScript ? "tsx" : "jsx";
  const scriptExt = isTypeScript ? "ts" : "js";

  const featureDir = path.resolve(appRoot, `./src/features/${folderName}`);

  const directories = [path.join(featureDir, "components"), path.join(featureDir, "hooks"), path.join(featureDir, "server")];

  directories.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

  const componentContent = isTypeScript
    ? `import type { JSX } from "solid-js";
import styles from "./${componentName}.module.scss";

// data flows in from the route loader via props.
// in your route file:
//
//   import { ${camelName}Action } from "@features/${folderName}/index.js";
//
//   export const loader = async () => await ${camelName}Action(undefined);
//
//   export default function Page() {
//     const data = useRouteData();
//     return <${componentName} data={data()} />;
//   }

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

  const actionsContent = isTypeScript
    ? `// raw server-side logic — DO NOT import UI code here
// these functions run exclusively on the server

export async function ${camelName}Query(input: unknown) {
  // TODO: implement server-side logic
  return { ok: true };
}
`
    : `// raw server-side logic — DO NOT import UI code here
// these functions run exclusively on the server

export async function ${camelName}Query(input) {
  // TODO: implement server-side logic
  return { ok: true };
}
`;

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

  const indexContent = isTypeScript
    ? `import { runOnServer } from "@anaemia/core";
import { ${camelName}Query } from "./server/actions.server.js";

// runOnServer wrappers — import these in your route loaders
export const ${camelName}Action = runOnServer(async (input: unknown) => {
  return await ${camelName}Query(input);
});

export { ${componentName} } from "./components/${componentName}.js";
export { use${componentName} } from "./hooks/use${componentName}.js";
`
    : `import { runOnServer } from "@anaemia/core";
import { ${camelName}Query } from "./server/actions.server.js";

export const ${camelName}Action = runOnServer(async (input) => {
  return await ${camelName}Query(input);
});

export { ${componentName} } from "./components/${componentName}.js";
export { use${componentName} } from "./hooks/use${componentName}.js";
`;

  fs.writeFileSync(path.join(featureDir, `components/${componentName}.${ext}`), componentContent, "utf8");

  fs.writeFileSync(path.join(featureDir, `components/${componentName}.module.scss`), `.wrapper {\n  display: block;\n}\n`, "utf8");

  fs.writeFileSync(path.join(featureDir, `server/actions.server.${scriptExt}`), actionsContent, "utf8");

  fs.writeFileSync(path.join(featureDir, `hooks/use${componentName}.${scriptExt}`), hookContent, "utf8");

  fs.writeFileSync(path.join(featureDir, `index.${scriptExt}`), indexContent, "utf8");

  console.log("\n🎯 successfully generated feature domain template structure:");
  console.log(`  └─ src/features/${folderName}/`);
  console.log(`      ├── components/`);
  console.log(`      │   ├── ${componentName}.${ext}`);
  console.log(`      │   └── ${componentName}.module.scss`);
  console.log(`      ├── hooks/`);
  console.log(`      │   └── use${componentName}.${scriptExt}`);
  console.log(`      ├── server/`);
  console.log(`      │   └── actions.server.${scriptExt}`);
  console.log(`      └── index.${scriptExt}\n`);
}

interface GeneratorOptions {
  logger: { error: (m: string) => void; success: (m: string) => void };
  pc: { dim: (s: string) => string; cyan: (s: string) => string };
}

export function generateSharedComponent(appRoot: string, componentName: string, { logger, pc }: GeneratorOptions) {
  const kebabFolder = toKebabCase(componentName);
  const pascalName = toPascalCase(componentName);

  const isTypeScript = fs.existsSync(path.join(appRoot, "tsconfig.json"));
  const ext = isTypeScript ? "tsx" : "jsx";

  const compDir = path.resolve(appRoot, `./src/shared/components/${kebabFolder}`);

  if (fs.existsSync(compDir)) {
    logger.error(`generation halted: shared UI component folder "${kebabFolder}" already exists.`);
    return false;
  }

  fs.mkdirSync(compDir, { recursive: true });

  const componentContent = isTypeScript
    ? `import { children, JSX } from "solid-js";
import styles from "./${pascalName}.module.scss";

interface ${pascalName}Props {
  children?: JSX.Element;
}

export function ${pascalName}(props: ${pascalName}Props) {
  // Safe evaluation wrapper preserves fine-grained reactive updates
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

  const cssContent = `.base {
  display: inline-block;
}
`;

  fs.writeFileSync(path.join(compDir, `${pascalName}.${ext}`), componentContent, "utf8");
  fs.writeFileSync(path.join(compDir, `${pascalName}.module.scss`), cssContent, "utf8");

  logger.success(`\n🌍 successfully generated global shared component capsule:`);
  console.log(pc.dim(`  └─ src/shared/components/${kebabFolder}/`));
  console.log(`     ├── ${pc.cyan(`${pascalName}.${ext}`)}`);
  console.log(`     └── ${pc.cyan(`${pascalName}.module.scss`)}\n`);

  return true;
}

export function scaffoldPage(rawName: string, appRoot: string) {
  const isTypeScript = fs.existsSync(path.join(appRoot, "tsconfig.json"));
  const ext = isTypeScript ? "tsx" : "jsx";
  const scriptExt = isTypeScript ? "ts" : "js";

  // rawName can be nested: "dashboard/settings" -> src/routes/dashboard/settings.tsx
  // or dynamic: "blog/[slug]" -> src/routes/blog/[slug].tsx
  const segments = rawName.replace(/\\/g, "/").split("/");
  const fileName = segments[segments.length - 1];
  const dirSegments = segments.slice(0, -1);

  const routesDir = path.resolve(appRoot, "./src/routes");
  const pageDir = dirSegments.length > 0 ? path.join(routesDir, ...dirSegments) : routesDir;

  const pagePath = path.join(pageDir, `${fileName}.${ext}`);
  const loaderTypePath = path.join(pageDir, `${fileName}.types.${scriptExt}`);

  if (fs.existsSync(pagePath)) {
    console.error(`[anaemia] generation halted: page "${rawName}" already exists at ${pagePath}`);
    process.exit(1);
  }

  fs.mkdirSync(pageDir, { recursive: true });

  // derive a component name from the file name
  const componentName =
    toPascalCase(
      fileName
        .replace(/^\[\.\.\./, "") // strip [...
        .replace(/^\[/, "") // strip [
        .replace(/\]$/, "") // strip ]
    ) + "Page";

  // derive the URL pattern for the comment header
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
    ? `export interface ${componentName}LoaderData {
  // TODO: define your loader return shape
}
`
    : null;

  const componentContent = isTypeScript
    ? `import type { ${componentName}LoaderData } from "./${fileName}.types";
import { useLoaderData } from "@anaemia/core";

// route: ${urlPattern}
${paramName ? `// param: ${paramName}` : ""}

export async function loader({ params${paramName ? `, request` : ""} }: { params: Record<string, string>; request: Request }) {
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
${paramName ? `// param: ${paramName}` : ""}

export async function loader({ params${paramName ? `, request` : ""} }) {
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
    fs.writeFileSync(loaderTypePath, typesContent, "utf8");
  }

  console.log("\n📄 successfully generated page route:");
  console.log(`  └─ src/routes/${rawName}.${ext}`);
  if (isTypeScript) {
    console.log(`      ├── ${fileName}.${ext}`);
    console.log(`      └── ${fileName}.types.${scriptExt}\n`);
  }
}

export function scaffoldHook(rawName: string, appRoot: string) {
  const isTypeScript = fs.existsSync(path.join(appRoot, "tsconfig.json"));
  const ext = isTypeScript ? "ts" : "js";

  // rawName can be:
  // "auth/usePermissions" -> adds to existing feature
  // "usePermissions"      -> creates in src/shared/hooks
  const segments = rawName.replace(/\\/g, "/").split("/");
  const isFeatureHook = segments.length > 1;

  const rawHookName = segments[segments.length - 1];
  const featureName = isFeatureHook ? segments[0] : null;

  // ensure it starts with "use"
  const hookName = rawHookName.startsWith("use") ? rawHookName : `use${toPascalCase(rawHookName)}`;

  const hookDir = isFeatureHook ? path.resolve(appRoot, `./src/features/${toKebabCase(featureName!)}/hooks`) : path.resolve(appRoot, `./src/shared/hooks`);

  const hookPath = path.join(hookDir, `${hookName}.${ext}`);

  if (fs.existsSync(hookPath)) {
    console.error(`[anaemia] generation halted: hook "${hookName}" already exists at ${hookPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }

  // if adding to a feature, check the feature actually exists
  if (isFeatureHook) {
    const featureDir = path.resolve(appRoot, `./src/features/${toKebabCase(featureName!)}`);
    if (!fs.existsSync(featureDir)) {
      console.error(`[anaemia] feature "${featureName}" does not exist. Run "create feature:${featureName}" first.`);
      process.exit(1);
    }
  }

  const hookContent = isTypeScript
    ? `import { createSignal, onMount, onCleanup } from "solid-js";

interface ${toPascalCase(hookName)}Options {
  // TODO: define options
}

interface ${toPascalCase(hookName)}Return {
  // TODO: define return shape
}

export function ${hookName}(options?: ${toPascalCase(hookName)}Options): ${toPascalCase(hookName)}Return {
  const [data, setData] = createSignal<unknown>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    // TODO: setup side effects
  });

  onCleanup(() => {
    // TODO: cleanup side effects
  });

  return { data, error, loading };
}
`
    : `import { createSignal, onMount, onCleanup } from "solid-js";

export function ${hookName}(options) {
  const [data, setData] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(false);

  onMount(() => {
    // TODO: setup side effects
  });

  onCleanup(() => {
    // TODO: cleanup side effects
  });

  return { data, error, loading };
}
`;

  fs.writeFileSync(hookPath, hookContent, "utf8");

  if (isFeatureHook) {
    const indexPath = path.resolve(appRoot, `./src/features/${toKebabCase(featureName!)}/index.${ext}`);

    if (fs.existsSync(indexPath)) {
      const existing = fs.readFileSync(indexPath, "utf8");
      const exportLine = `export { ${hookName} } from "./hooks/${hookName}";\n`;

      if (!existing.includes(exportLine)) {
        fs.appendFileSync(indexPath, exportLine, "utf8");
      }
    }
  }

  const location = isFeatureHook ? `src/features/${toKebabCase(featureName!)}/hooks/${hookName}.${ext}` : `src/shared/hooks/${hookName}.${ext}`;

  console.log("\n🪝 successfully generated hook:");
  console.log(`  └─ ${location}\n`);
}
