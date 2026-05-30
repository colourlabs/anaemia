import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fetchTemplate } from "../dist/utils/fetch-template.js";

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