import test from "node:test";
import assert from "node:assert/strict";
import { $$executeClientRpc, extractRpcToken, getRpcToken } from "../dist/runtime/rpc-client.js";

test("$$executeClientRpc returns a callable function with correct id", () => {
  const fn = $$executeClientRpc("myFn");
  assert.equal(typeof fn, "function");
  assert.equal(fn.id, "myFn");
});

test("$$executeClientRpc has readHydrationCache method", () => {
  const fn = $$executeClientRpc("myFn");
  assert.equal(typeof fn.readHydrationCache, "function");
});

test("readHydrationCache returns undefined when no cache exists", () => {
  const fn = $$executeClientRpc("noCache");
  const result = fn.readHydrationCache("someArg");
  assert.equal(result, undefined);
});

test("readHydrationCache reads from SSR store on server", async () => {
  const store = new Map();
  store.set("__SERVER_FUNCTION_DATA__", {
    greet: { '["Ada"]': "hello Ada" },
  });

  const { ssrStorage } = await import("../dist/runtime/context.js");
  const fn = $$executeClientRpc("greet");

  await ssrStorage.run(store, async () => {
    const result = fn.readHydrationCache("Ada");
    assert.equal(result, "hello Ada");
  });
});

test("findLooseCacheMatch falls back to prefix match", async () => {
  const store = new Map();
  store.set("__SERVER_FUNCTION_DATA__", {
    greet: { '["Ada", "extra"]': "hello Ada" },
  });

  const { ssrStorage } = await import("../dist/runtime/context.js");
  const fn = $$executeClientRpc("greet");

  await ssrStorage.run(store, async () => {
    const result = fn.readHydrationCache("Ada");
    assert.equal(result, "hello Ada");
  });
});

test("asyncRpcCall reads from SSR store and returns cached result on server", async () => {
  const store = new Map();
  store.set("__SERVER_FUNCTION_DATA__", {
    getData: { '["key1"]': { value: 42 } },
  });

  const { ssrStorage } = await import("../dist/runtime/context.js");
  const fn = $$executeClientRpc("getData");

  await ssrStorage.run(store, async () => {
    const result = await fn("key1");
    assert.deepEqual(result, { value: 42 });
  });
});

test("asyncRpcCall returns undefined when no SSR store exists", async () => {
  const fn = $$executeClientRpc("missing");
  const result = await fn("someArg");
  assert.equal(result, undefined);
});

test("extractRpcToken reads the token out of a hydrated payload", () => {
  const raw = JSON.stringify({ __RPC_TOKEN__: "abc.def.ghi", __LOADER_DATA__: { x: 1 } });
  assert.equal(extractRpcToken(raw), "abc.def.ghi");
});

test("extractRpcToken returns null for malformed or token-less payloads", () => {
  assert.equal(extractRpcToken("not json"), null);
  assert.equal(extractRpcToken(JSON.stringify({ __LOADER_DATA__: {} })), null);
});

test("getRpcToken is a function", () => {
  assert.equal(typeof getRpcToken, "function");
});
