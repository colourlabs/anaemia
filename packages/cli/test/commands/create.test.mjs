import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-create-test-"));
}

test("convertTypeScriptToJs strips types from .ts files", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(path.join(dir, "index.ts"), `const x: string = "hello";\nexport default x;\n`);

    const { convertTypeScriptToJs } = await import("../../dist/utils/ts-to-js.js");
    convertTypeScriptToJs(dir);

    assert.ok(!fs.existsSync(path.join(dir, "index.ts")), "ts file should be removed");
    assert.ok(fs.existsSync(path.join(dir, "index.js")), "js file should exist");
    const content = fs.readFileSync(path.join(dir, "index.js"), "utf-8");
    assert.ok(!content.includes(": string"), "type annotation should be stripped");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convertTypeScriptToJs strips types from .tsx files", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "Component.tsx"),
      `export default function Comp(props: { name: string }) {\n  return <div>{props.name}</div>;\n}\n`,
    );

    const { convertTypeScriptToJs } = await import("../../dist/utils/ts-to-js.js");
    convertTypeScriptToJs(dir);

    assert.ok(!fs.existsSync(path.join(dir, "Component.tsx")));
    assert.ok(fs.existsSync(path.join(dir, "Component.jsx")));
    const content = fs.readFileSync(path.join(dir, "Component.jsx"), "utf-8");
    assert.ok(!content.includes(": string"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convertTypeScriptToJs cleans up leading blank lines", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "root.tsx"),
      `import { JSX } from "solid-js";\n\nexport default function Root(props: { children: JSX.Element }) {\n  return <>{props.children}</>;\n}\n`,
    );

    const { convertTypeScriptToJs } = await import("../../dist/utils/ts-to-js.js");
    convertTypeScriptToJs(dir);

    const content = fs.readFileSync(path.join(dir, "root.jsx"), "utf-8");
    assert.ok(!content.startsWith("\n"), "file should not start with blank lines");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convertTypeScriptToJs removes tsconfig.json", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    fs.writeFileSync(path.join(dir, "index.ts"), `export const x = 1;\n`);

    const { convertTypeScriptToJs } = await import("../../dist/utils/ts-to-js.js");
    convertTypeScriptToJs(dir);

    assert.ok(!fs.existsSync(path.join(dir, "tsconfig.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convertTypeScriptToJs does not convert d.ts to d.js", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(path.join(dir, "types.d.ts"), `export type MyType = string;\n`);
    const { convertTypeScriptToJs } = await import("../../dist/utils/ts-to-js.js");
    convertTypeScriptToJs(dir);
    assert.ok(!fs.existsSync(path.join(dir, "types.d.js")), "types.d.js should not be created");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convertTypeScriptToJs creates jsconfig.json with correct config", async () => {
  const dir = createTmpDir();
  try {
    const { convertTypeScriptToJs } = await import("../../dist/utils/ts-to-js.js");
    convertTypeScriptToJs(dir);

    const jsconfigPath = path.join(dir, "jsconfig.json");
    assert.ok(fs.existsSync(jsconfigPath), "jsconfig.json should be created");

    const jsconfig = JSON.parse(fs.readFileSync(jsconfigPath, "utf-8"));
    assert.equal(jsconfig.compilerOptions.jsx, "preserve");
    assert.equal(jsconfig.compilerOptions.jsxImportSource, "solid-js");
    assert.equal(jsconfig.compilerOptions.checkJs, false);
    assert.deepEqual(jsconfig.compilerOptions.paths["~/*"], ["./src/*"]);
    assert.deepEqual(jsconfig.compilerOptions.paths["@core/*"], ["./src/core/*"]);
    assert.deepEqual(jsconfig.compilerOptions.paths["@shared/*"], ["./src/shared/*"]);
    assert.deepEqual(jsconfig.compilerOptions.paths["@features/*"], ["./src/features/*"]);
    assert.ok(jsconfig.include.includes("./anaemia.d.ts"));
    assert.ok(jsconfig.include.includes("./anaemia.config.js"));
    assert.ok(jsconfig.exclude.includes("node_modules"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
