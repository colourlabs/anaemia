import test from "node:test";
import assert from "node:assert/strict";

const { createHydrationDataScript, createHydrationRuntimeScript } = await import(
  "../dist/runtime/server/hydration.js"
);

// createHydrationDataScript

test("createHydrationDataScript: outputs script tag with correct id", () => {
  const store = new Map();
  const html = createHydrationDataScript(store);
  assert.ok(html.includes('id="__ANAEMIA_DATA__"'));
  assert.ok(html.includes('type="application/json"'));
});

test("createHydrationDataScript: wraps content in script tags", () => {
  const store = new Map();
  const html = createHydrationDataScript(store);
  assert.ok(html.startsWith("<script"));
  assert.ok(html.endsWith("</script>\n"));
});

test("createHydrationDataScript: serializes loader data", () => {
  const store = new Map();
  store.set("__LOADER_DATA__", { user: "Alice" });
  const html = createHydrationDataScript(store);
  assert.ok(html.includes('"__LOADER_DATA__"'));
  assert.ok(html.includes('"user":"Alice"'));
});

test("createHydrationDataScript: serializes server function data", () => {
  const store = new Map();
  store.set("__SERVER_FUNCTION_DATA__", { fetchData: { '["1"]': { id: 1 } } });
  const html = createHydrationDataScript(store);
  assert.ok(html.includes('"__SERVER_FUNCTION_DATA__"'));
  assert.ok(html.includes('"fetchData"'));
});

test("createHydrationDataScript: handles empty store with defaults", () => {
  const store = new Map();
  const html = createHydrationDataScript(store);
  assert.ok(html.includes('"__LOADER_DATA__":{}'));
  assert.ok(html.includes('"__SERVER_FUNCTION_DATA__":{}'));
});

test("createHydrationDataScript: escapes HTML dangerous characters", () => {
  const store = new Map();
  store.set("__LOADER_DATA__", { html: "<script>alert(1)</script>" });
  const html = createHydrationDataScript(store);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("\\u003c"));
  assert.ok(html.includes("\\u003e"));
});

test("createHydrationDataScript: escapes ampersands", () => {
  const store = new Map();
  store.set("__LOADER_DATA__", { val: "a&b" });
  const html = createHydrationDataScript(store);
  assert.ok(html.includes("\\u0026"));
});

test("createHydrationDataScript: escapes forward slashes", () => {
  const store = new Map();
  store.set("__LOADER_DATA__", { path: "a/b/c" });
  const html = createHydrationDataScript(store);
  assert.ok(html.includes("\\u002f"));
});

// createHydrationRuntimeScript

test("createHydrationRuntimeScript: returns a non-empty string", () => {
  const script = createHydrationRuntimeScript();
  assert.equal(typeof script, "string");
  assert.ok(script.length > 0);
});

test("createHydrationRuntimeScript: returns valid JavaScript", () => {
  const script = createHydrationRuntimeScript();
  assert.ok(script.includes("script"));
});
