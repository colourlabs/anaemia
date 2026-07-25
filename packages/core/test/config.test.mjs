import test from "node:test";
import assert from "node:assert/strict";

const { defineConfig, definePlugin } = await import("../dist/config.js");

// defineConfig

test("defineConfig: returns the config object as-is", () => {
  const config = { port: 3000 };
  const result = defineConfig(config);
  assert.deepEqual(result, config);
  assert.equal(result, config);
});

test("defineConfig: preserves all properties", () => {
  const config = {
    port: 8080,
    assets: { publicPath: "/static/" },
    styles: { sass: true, modules: true },
    experimental: { outputModule: true },
    plugins: [],
    define: { client: { __APP_VERSION__: JSON.stringify("1.0.0") } },
  };
  const result = defineConfig(config);
  assert.equal(result.port, 8080);
  assert.deepEqual(result.assets, { publicPath: "/static/" });
  assert.deepEqual(result.styles, { sass: true, modules: true });
  assert.deepEqual(result.experimental, { outputModule: true });
  assert.deepEqual(result.plugins, []);
  assert.deepEqual(result.define, { client: { __APP_VERSION__: JSON.stringify("1.0.0") } });
});

test("defineConfig: handles empty config", () => {
  const result = defineConfig({});
  assert.deepEqual(result, {});
});

test("defineConfig: handles undefined values", () => {
  const config = { port: undefined, styles: undefined };
  const result = defineConfig(config);
  assert.equal(result.port, undefined);
  assert.equal(result.styles, undefined);
});

// definePlugin

test("definePlugin: returns the plugin object as-is", () => {
  const plugin = { name: "test-plugin" };
  const result = definePlugin(plugin);
  assert.deepEqual(result, plugin);
  assert.equal(result, plugin);
});

test("definePlugin: preserves all plugin hooks", () => {
  const plugin = {
    name: "full-plugin",
    clientRspackConfig: (c) => c,
    serverRspackConfig: (c) => c,
    babelPlugins: { client: [], server: [] },
    configureServer: () => {},
    configureDocument: () => {},
    injectHead: () => "<meta>",
    injectBody: () => "<div>",
    injectBodyStart: () => "<div>",
  };
  const result = definePlugin(plugin);
  assert.equal(result.name, "full-plugin");
  assert.equal(typeof result.clientRspackConfig, "function");
  assert.equal(typeof result.serverRspackConfig, "function");
  assert.equal(typeof result.configureServer, "function");
  assert.equal(typeof result.configureDocument, "function");
  assert.equal(typeof result.injectHead, "function");
  assert.equal(typeof result.injectBody, "function");
  assert.equal(typeof result.injectBodyStart, "function");
});

test("definePlugin: handles minimal plugin", () => {
  const plugin = { name: "minimal" };
  const result = definePlugin(plugin);
  assert.equal(result.name, "minimal");
  assert.equal(result.clientRspackConfig, undefined);
  assert.equal(result.configureDocument, undefined);
});

test("definePlugin: preserves optional plugin properties", () => {
  const plugin = { name: "optional-props" };
  const result = definePlugin(plugin);
  assert.equal(result.babelPlugins, undefined);
  assert.equal(result.configureServer, undefined);
});
