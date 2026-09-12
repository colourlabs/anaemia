import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensurePnpmWorkspace } from "../dist/utils/pnpm-workspace.js";

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-workspace-"));
}

test("ensurePnpmWorkspace writes allowlist when file is missing", () => {
  const dir = createTmpDir();
  try {
    ensurePnpmWorkspace(dir);
    const content = fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    assert.match(content, /allowBuilds:/);
    assert.match(content, /"@parcel\/watcher":\s*true/);
    assert.match(content, /simple-git-hooks:\s*true/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ensurePnpmWorkspace is idempotent once allowlist exists", () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), 'allowBuilds:\n  "@parcel/watcher": true\n', "utf8");
    ensurePnpmWorkspace(dir);
    const content = fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    assert.match(content, /allowBuilds:/);
    assert.doesNotMatch(content, /simple-git-hooks/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ensurePnpmWorkspace preserves minimumReleaseAgeStrict=false", () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "minimumReleaseAgeStrict: false\n", "utf8");
    ensurePnpmWorkspace(dir);
    const content = fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    assert.match(content, /minimumReleaseAgeStrict:\s*false/);
    assert.match(content, /allowBuilds:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
