import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeApp, walkAst } from "../dist/analyzer/index.js";

function createTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-analyzer-test-"));
  fs.mkdirSync(path.join(dir, "src/routes/users/[id]"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src/features/auth/components"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src/shared/utils"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "anaemia.config.ts"),
    `
    import { defineConfig } from "@anaemia/core";
    export default defineConfig({ port: 3005 });
  `,
  );

  fs.writeFileSync(path.join(dir, "src/root.tsx"), `export default function Root(props) { return props.children; }`);

  // route with PUBLIC_ env - valid
  fs.writeFileSync(
    path.join(dir, "src/routes/users/[id]/index.tsx"),
    `export default function UserPage() { return <h1>{import.meta.env.PUBLIC_API_URL}</h1>; }`,
  );

  // route with non-PUBLIC_ env - should warn
  fs.writeFileSync(
    path.join(dir, "src/routes/index.tsx"),
    `export default function Home() { return <div>{import.meta.env.SECRET_KEY}</div>; }`,
  );

  // route with process.env - should warn
  fs.writeFileSync(
    path.join(dir, "src/routes/about.tsx"),
    `export default function About() { return <div>{process.env.API_KEY}</div>; }`,
  );

  // server route - env access should not warn
  fs.writeFileSync(
    path.join(dir, "src/routes/users/[id]/_route.ts"),
    `export const GET = () => new Response(import.meta.env.SECRET_KEY);`,
  );

  // .server file - env access should not warn
  fs.writeFileSync(
    path.join(dir, "src/features/auth/components/auth.server.ts"),
    `export const getToken = () => import.meta.env.SECRET_TOKEN;`,
  );

  // feature component with non-PUBLIC_ env - should warn & importing from aliased dir with relative path - should warn
  fs.writeFileSync(
    path.join(dir, "src/features/auth/components/Login.tsx"),
    `
    import { authService } from "../../../core/services/auth";
    export function Login() { return <form action={import.meta.env.AUTH_URL} />; }
    `,
  );

  // server function definition
  fs.writeFileSync(
    path.join(dir, "src/features/auth/components/actions.server.ts"),
    `
    import { runOnServer } from "@anaemia/core";
    export const getUser = runOnServer(async (id) => ({ id }), "getUser");
    export const unusedFn = runOnServer(async () => {}, "unusedFn");
  `,
  );

  // only imports getUser, not unusedFn
  fs.writeFileSync(
    path.join(dir, "src/routes/users/[id]/index.tsx"),
    `
    import { getUser } from "../../features/auth/components/actions.server";
    export default function UserPage() { return <h1>{import.meta.env.PUBLIC_API_URL}</h1>; }
  `,
  );

  // already using alias - should not warn
  fs.writeFileSync(
    path.join(dir, "src/shared/utils/format.ts"),
    `
    import { something } from "@core/services/auth";
    export const format = () => {};
    `,
  );

  // relative import within same directory - should not warn
  fs.writeFileSync(
    path.join(dir, "src/features/auth/components/Button.tsx"),
    `
    import { styles } from "./styles";
    export function Button() { return <button />; }
    `,
  );

  return dir;
}

// file classification

test("analyzeApp classifies file kinds correctly", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const kinds = new Map(result.files.map((f) => [f.relativePath, f.kind]));

    assert.equal(kinds.get("anaemia.config.ts"), "config");
    assert.equal(kinds.get("src/root.tsx"), "root");
    assert.equal(kinds.get("src/routes/users/[id]/index.tsx"), "route");
    assert.equal(kinds.get("src/routes/users/[id]/_route.ts"), "server-route");
    assert.equal(result.build.mode, "test");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// defineConfig

test("analyzeApp handles defineConfig in anaemia.config.ts without errors", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const configFile = result.files.find((f) => f.relativePath === "anaemia.config.ts");

    assert.ok(configFile, "config file should be present");
    assert.ok(configFile.program !== null, "config file should parse without error");

    const configErrors = configFile.diagnostics.filter((d) => d.severity === "error");
    assert.equal(configErrors.length, 0, "config file should have no parse errors");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// env access

test("env check: PUBLIC_ prefix passes without warning", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "ENV_NOT_PUBLIC" && d.file?.includes("users/[id]/index.tsx"),
    );
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("env check: non-PUBLIC_ prefix in route warns", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "ENV_NOT_PUBLIC" && d.filePath?.includes("routes/index.tsx"),
    );
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].message.includes("SECRET_KEY"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("env check: non-PUBLIC_ prefix in feature component warns", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter((d) => d.code === "ENV_NOT_PUBLIC" && d.filePath?.includes("Login.tsx"));
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].message.includes("AUTH_URL"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("env check: server route does not warn for non-PUBLIC_ env", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter((d) => d.code === "ENV_NOT_PUBLIC" && d.file?.includes("_route.ts"));
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("env check: .server.ts file does not warn for non-PUBLIC_ env", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "ENV_NOT_PUBLIC" && d.file?.includes("auth.server.ts"),
    );
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("env check: process.env usage warns", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "PROCESS_ENV_ACCESS" && d.filePath?.includes("about.tsx"),
    );
    assert.equal(warnings.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("env check: ALWAYS_SAFE keys do not warn", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-analyzer-test-"));
  try {
    fs.mkdirSync(path.join(dir, "src/routes"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src/routes/index.tsx"),
      `
      export default function Page() {
        return <div>{import.meta.env.NODE_ENV}{import.meta.env.MODE}{import.meta.env.DEV}{import.meta.env.PROD}</div>;
      }
    `,
    );
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter((d) => d.code === "ENV_NOT_PUBLIC");
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// unused server functions

test("unused server functions: imported function does not warn", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "UNUSED_SERVER_FUNCTION" && d.message?.includes("getUser"),
    );
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unused server functions: unimported function warns", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "UNUSED_SERVER_FUNCTION" && d.message?.includes("unusedFn"),
    );
    assert.equal(warnings.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// route metadata

test("route metadata: static route detected correctly", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const aboutMeta = result.routeMetadata?.find((m) => m.filePath.includes("about.tsx"));
    assert.ok(aboutMeta);
    assert.equal(aboutMeta.isStatic, true);
    assert.equal(aboutMeta.hasLoader, false);
    assert.equal(aboutMeta.hasGuard, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("route metadata: route with server function import is not static", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const userMeta = result.routeMetadata?.find((m) => m.filePath.includes("users/[id]/index.tsx"));
    assert.ok(userMeta);
    assert.equal(userMeta.isStatic, false);
    assert.equal(userMeta.hasServerFunctions, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("route metadata: params extracted from file path", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const userMeta = result.routeMetadata?.find((m) => m.filePath.includes("users/[id]"));
    assert.ok(userMeta);
    assert.ok(userMeta.params.includes("id"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// walkAst

test("walkAst visits all expected node types", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { include: ["src/routes/**/*.tsx"] });
    const routeFile = result.files.find((f) => f.relativePath === "src/routes/users/[id]/index.tsx");

    assert.ok(routeFile);
    const seen = new Set();
    walkAst(routeFile.program, {
      enter(node) {
        seen.add(node.type);
      },
    });

    assert.ok(seen.has("Program"));
    assert.ok(seen.has("ImportDeclaration"));
    assert.ok(seen.has("ExportDefaultDeclaration"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// alias imports

test("alias check: relative import escaping into aliased dir warns", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "PREFER_ALIAS_IMPORT" && d.filePath?.includes("Login.tsx"),
    );
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].message.includes("../../../core/services/auth"));
    assert.ok(warnings[0].help.includes("@core"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("alias check: already using alias does not warn", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "PREFER_ALIAS_IMPORT" && d.filePath?.includes("format.ts"),
    );
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("alias check: same-directory relative import does not warn", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "PREFER_ALIAS_IMPORT" && d.filePath?.includes("Button.tsx"),
    );
    assert.equal(warnings.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("alias check: help message suggests correct alias", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const warning = result.diagnostics.find(
      (d) => d.code === "PREFER_ALIAS_IMPORT" && d.filePath?.includes("Login.tsx"),
    );
    assert.ok(warning);
    assert.ok(warning.help.includes("@core/services/auth"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("alias check: dynamic import with relative escape warns", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-analyzer-test-"));
  try {
    fs.mkdirSync(path.join(dir, "src/features/auth"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src/features/auth/lazy.ts"),
      `export const load = () => import("../../shared/utils/format");`,
    );
    const result = await analyzeApp(dir, { mode: "test" });
    const warnings = result.diagnostics.filter(
      (d) => d.code === "PREFER_ALIAS_IMPORT" && d.filePath?.includes("lazy.ts"),
    );
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].help.includes("@shared"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// missing route export

test("missing route export: route with default export passes", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const errors = result.diagnostics.filter(
      (d) => d.code === "MISSING_ROUTE_EXPORT" && d.filePath?.includes("routes/index.tsx"),
    );
    assert.equal(errors.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("missing route export: route without default export errors", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-analyzer-test-"));
  try {
    fs.mkdirSync(path.join(dir, "src/routes"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/routes/index.tsx"), `export function notDefault() { return <div />; }`);
    const result = await analyzeApp(dir, { mode: "test" });
    const errors = result.diagnostics.filter((d) => d.code === "MISSING_ROUTE_EXPORT");
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes("routes/index.tsx"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("missing route export: re-exported default passes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-analyzer-test-"));
  try {
    fs.mkdirSync(path.join(dir, "src/routes"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "src/routes/index.tsx"),
      `import { Page } from "../features/home"; export { Page as default };`,
    );
    const result = await analyzeApp(dir, { mode: "test" });
    const errors = result.diagnostics.filter((d) => d.code === "MISSING_ROUTE_EXPORT");
    assert.equal(errors.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("missing route export: server-route is not checked", async () => {
  const dir = createTmpProject();
  try {
    const result = await analyzeApp(dir, { mode: "test" });
    const errors = result.diagnostics.filter(
      (d) => d.code === "MISSING_ROUTE_EXPORT" && d.filePath?.includes("_route.ts"),
    );
    assert.equal(errors.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
