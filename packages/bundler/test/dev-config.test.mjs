import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getRspackConfig } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../../../templates/base-app");

test("dev client config keeps solid-refresh from rewriting generated JSX islands", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const [clientConfig] = await getRspackConfig(appRoot, { port: 4444 });
    const rules = clientConfig.module.rules;
    const plugins = rules.flatMap((rule) => rule.use?.[0]?.options?.plugins ?? []);
    const solidRefresh = plugins.find((plugin) => Array.isArray(plugin) && String(plugin[0]).includes("solid-refresh"));

    assert.ok(solidRefresh);
    assert.equal(solidRefresh[1].bundler, "rspack-esm");
    assert.equal(solidRefresh[1].jsx, false);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
