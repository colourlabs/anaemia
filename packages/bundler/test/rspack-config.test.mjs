import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { getRspackConfig } from "../dist/index.js";

async function createTmpProject(isTs = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-bundler-test-"));

  fs.mkdirSync(path.join(dir, "src/routes"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/routes/index.tsx"), `export default function Index() { return <div>hello</div>; }`);
  fs.writeFileSync(path.join(dir, "index.html"), `<html><body><div anaemia-entry></div></body></html>`);

  if (isTs) {
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  }

  return dir;
}

test("getRspackConfig returns two configurations", async () => {
  const dir = await createTmpProject();
  try {
    const configs = await getRspackConfig(dir, {});
    assert.equal(Array.isArray(configs), true);
    assert.equal(configs.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("client config targets web, server config targets node", async () => {
  const dir = await createTmpProject();
  try {
    const [clientConfig, serverConfig] = await getRspackConfig(dir, {});
    assert.equal(clientConfig.target, "web");
    assert.equal(serverConfig.target, "node");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runtimeDir always resolves to dist, never src", async () => {
  const dir = await createTmpProject();
  try {
    const [clientConfig, serverConfig] = await getRspackConfig(dir, {});
    const clientEntry = Object.values(clientConfig.entry).flat().join(" ");
    const serverEntry = Object.values(serverConfig.entry).flat().join(" ");
    assert.ok(!clientEntry.includes("/src/runtime"), `client entry points into src: ${clientEntry}`);
    assert.ok(!serverEntry.includes("/src/runtime"), `server entry points into src: ${serverEntry}`);
    assert.ok(clientEntry.includes("/dist/runtime"), `client entry should point to dist: ${clientEntry}`);
    assert.ok(serverEntry.includes("/dist/runtime"), `server entry should point to dist: ${serverEntry}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generated entry is .tsx for TypeScript projects", async () => {
  const dir = await createTmpProject(true);
  try {
    await getRspackConfig(dir, {});
    const entryFile = path.join(dir, ".anaemia/__anaemia_entry__.tsx");
    assert.ok(fs.existsSync(entryFile), "expected .tsx entry file");
    assert.ok(!fs.existsSync(path.join(dir, ".anaemia/__anaemia_entry__.jsx")), "unexpected .jsx entry file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generated entry is .jsx for JavaScript projects", async () => {
  const dir = await createTmpProject(false);
  try {
    await getRspackConfig(dir, {});
    const entryFile = path.join(dir, ".anaemia/__anaemia_entry__.jsx");
    assert.ok(fs.existsSync(entryFile), "expected .jsx entry file");
    assert.ok(!fs.existsSync(path.join(dir, ".anaemia/__anaemia_entry__.tsx")), "unexpected .tsx entry file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("generated JS entry has no TypeScript syntax", async () => {
  const dir = await createTmpProject(false);
  try {
    await getRspackConfig(dir, {});
    const content = fs.readFileSync(path.join(dir, ".anaemia/__anaemia_entry__.jsx"), "utf-8");
    assert.ok(!content.includes(": string"), "found TypeScript type annotation in JS entry");
    assert.ok(!content.includes("// @ts-nocheck"), "found @ts-nocheck in JS entry");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("server config aliases point to dist not src", async () => {
  const dir = await createTmpProject();
  try {
    const [, serverConfig] = await getRspackConfig(dir, {});
    const aliases = serverConfig.resolve?.alias ?? {};
    for (const [key, val] of Object.entries(aliases)) {
      if (typeof val === "string" && val.includes("@anaemia/core")) {
        assert.ok(!val.includes("/src/"), `alias ${key} points to src: ${val}`);
        assert.ok(val.includes("/dist/"), `alias ${key} should point to dist: ${val}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});