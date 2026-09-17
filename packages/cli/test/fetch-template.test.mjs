import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";

import { fetchTemplate } from "../dist/utils/fetch-template.js";

const { default: pkg } = await import("../package.json", { with: { type: "json" } });
const version = pkg.version;
const PREFIX = `anaemia-${version}/templates/base-app`;

async function makeTar(files) {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-src-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(src, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (content && typeof content === "object" && content.symlink) {
        fs.symlinkSync(content.symlink, full);
      } else {
        fs.writeFileSync(full, content);
      }
    }

    const chunks = [];
    const stream = tar.create({ gzip: true, cwd: src, prefix: PREFIX, portable: true }, Object.keys(files));
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
  }
}

async function withMockedTar(buffer, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(buffer, { status: 200 });
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("fetchTemplate extracts template contents directly into target directory", async () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-template-"));

  try {
    await fetchTemplate(targetDir);

    const files = fs.readdirSync(targetDir);
    assert.ok(files.includes("package.json"), "missing package.json");
    assert.ok(files.includes("src"), "missing src directory");
    assert.ok(files.includes("anaemia.config.ts"), "missing anaemia.config.ts");
    assert.ok(!files.includes("base-app"), "base-app subdirectory should not exist");
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test("fetchTemplate rejects an archive containing a file that is not in the manifest", async () => {
  const buffer = await makeTar({ "evil.txt": "malicious" });
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-template-"));

  try {
    await withMockedTar(buffer, async () => {
      await assert.rejects(fetchTemplate(targetDir), /unexpected file|integrity|missing/i);
    });
    assert.deepEqual(fs.readdirSync(targetDir), [], "target must stay untouched when verification fails");
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test("fetchTemplate rejects an archive whose contents do not match the manifest", async () => {
  const buffer = await makeTar({ "package.json": '{"name":"tampered"}' });
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-template-"));

  try {
    await withMockedTar(buffer, async () => {
      await assert.rejects(fetchTemplate(targetDir), /integrity check failed|missing a file/i);
    });
    assert.deepEqual(fs.readdirSync(targetDir), [], "target must stay untouched when verification fails");
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test("fetchTemplate rejects an archive containing a symlink", async () => {
  const buffer = await makeTar({ "package.json": { symlink: "/etc/passwd" } });
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-template-"));

  try {
    await withMockedTar(buffer, async () => {
      await assert.rejects(fetchTemplate(targetDir));
    });
    assert.deepEqual(fs.readdirSync(targetDir), [], "target must stay untouched when verification fails");
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
