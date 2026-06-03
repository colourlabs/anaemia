import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import filePath from "node:path";

import { loadUserConfig } from "../dist/utils/config.js";

function createTmpDir() {
  return fs.mkdtempSync(filePath.join(os.tmpdir(), "anaemia-config-test-"));
}

test("loadUserConfig - returns empty object if no config file exists", async () => {
  const dir = createTmpDir();
  try {
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - parses TS config file (anaemia.config.ts) with TypeScript / ESM syntax", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      filePath.join(dir, "anaemia.config.ts"),
      `
      type MyPort = number;
      const port: MyPort = 3005;
      export default {
        port,
        styles: {
          sass: true
        }
      };
      `,
    );
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {
      port: 3005,
      styles: {
        sass: true,
      },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - parses JS config file (anaemia.config.js) with ESM syntax", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      filePath.join(dir, "anaemia.config.js"),
      `
      export default {
        port: 3006,
        styles: {
          modules: true
        }
      };
      `,
    );
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {
      port: 3006,
      styles: {
        modules: true,
      },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - parses MJS config file (anaemia.config.mjs) with ESM syntax", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      filePath.join(dir, "anaemia.config.mjs"),
      `
      export default {
        port: 3007
      };
      `,
    );
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {
      port: 3007,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - parses CJS config file (anaemia.config.cjs) with CommonJS syntax", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      filePath.join(dir, "anaemia.config.cjs"),
      `
      module.exports = {
        port: 3008,
        styles: {
          typedModules: "emit"
        }
      };
      `,
    );
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {
      port: 3008,
      styles: {
        typedModules: "emit",
      },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - parses TS config file (anaemia.config.ts) containing CommonJS syntax", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(
      filePath.join(dir, "anaemia.config.ts"),
      `
      module.exports = {
        port: 3009
      };
      `,
    );
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {
      port: 3009,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - handles parser errors gracefully and returns empty object", async () => {
  const dir = createTmpDir();
  const originalError = console.error;
  console.error = () => {};
  try {
    fs.writeFileSync(
      filePath.join(dir, "anaemia.config.ts"),
      `
      // Syntax error
      const port = ;
      export default { port };
      `,
    );
    const config = await loadUserConfig(dir);
    assert.deepEqual(config, {});
  } finally {
    console.error = originalError;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserConfig - respects resolution precedence (ts > js > mjs > cjs)", async () => {
  const dir = createTmpDir();
  try {
    fs.writeFileSync(filePath.join(dir, "anaemia.config.js"), "export default { port: 3010 };");
    fs.writeFileSync(filePath.join(dir, "anaemia.config.ts"), "export default { port: 3011 };");
    const config = await loadUserConfig(dir);
    assert.equal(config.port, 3011);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
