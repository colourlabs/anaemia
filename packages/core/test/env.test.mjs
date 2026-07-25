import test from "node:test";
import assert from "node:assert/strict";

const { createRuntimeEnv } = await import("../dist/runtime/server/env.js");

test("createRuntimeEnv: defaults to port 3000", () => {
  const env = createRuntimeEnv({});
  assert.equal(env.port, 3000);
});

test("createRuntimeEnv: uses PORT env var", () => {
  const env = createRuntimeEnv({ PORT: "8080" });
  assert.equal(env.port, 8080);
});

test("createRuntimeEnv: defaults isDev to true", () => {
  const env = createRuntimeEnv({});
  assert.equal(env.isDev, true);
});

test("createRuntimeEnv: isDev is false when NODE_ENV is production", () => {
  const env = createRuntimeEnv({ NODE_ENV: "production" });
  assert.equal(env.isDev, false);
});

test("createRuntimeEnv: isDev is true when NODE_ENV is development", () => {
  const env = createRuntimeEnv({ NODE_ENV: "development" });
  assert.equal(env.isDev, true);
});

test("createRuntimeEnv: defaults devServerUrl port to 4445", () => {
  const env = createRuntimeEnv({});
  assert.equal(env.devServerUrl, "http://localhost:4445");
});

test("createRuntimeEnv: uses RSPACK_DEV_PORT env var", () => {
  const env = createRuntimeEnv({ RSPACK_DEV_PORT: "5555" });
  assert.equal(env.devServerUrl, "http://localhost:5555");
});

test("createRuntimeEnv: sets templatePath relative to cwd", () => {
  const env = createRuntimeEnv({});
  assert.ok(env.templatePath.endsWith(".anaemia/client/index.html"));
  assert.ok(env.templatePath.includes("/"));
});

test("createRuntimeEnv: sets manifestPath relative to cwd", () => {
  const env = createRuntimeEnv({});
  assert.ok(env.manifestPath.endsWith(".anaemia/route-manifest.json"));
});

test("createRuntimeEnv: sets clientDistPath relative to cwd", () => {
  const env = createRuntimeEnv({});
  assert.ok(env.clientDistPath.endsWith(".anaemia/client"));
});

test("createRuntimeEnv: parses PORT as number", () => {
  const env = createRuntimeEnv({ PORT: "abc" });
  assert.equal(env.port, 3000);
});

test("createRuntimeEnv: parses RSPACK_DEV_PORT as number", () => {
  const env = createRuntimeEnv({ RSPACK_DEV_PORT: "abc" });
  assert.equal(env.devServerUrl, "http://localhost:4445");
});
