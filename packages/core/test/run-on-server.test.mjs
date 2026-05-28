import assert from "node:assert/strict";
import test from "node:test";
import {
  runOnServer,
  serverFunctionsRegistry,
  ssrStorage,
} from "../dist/runtime/context.js";
import { createRouteRequest } from "../dist/runtime/route-request.js";

test("runOnServer returns a callable function and registers the original implementation", async () => {
  const add = runOnServer((a, b) => a + b, "add");

  assert.equal(typeof add, "function");
  assert.equal(add.id, "add");
  assert.equal(add.urlId, "add");
  assert.equal(await add(2, 3), 5);
  assert.equal(await serverFunctionsRegistry.get("add")(4, 6), 10);
});

test("runOnServer records SSR results by id and argument list for hydration", async () => {
  const greet = runOnServer((name) => `hello ${name}`, "greet");
  const store = new Map();

  await ssrStorage.run(store, async () => {
    assert.equal(await greet("Ada"), "hello Ada");
  });

  assert.deepEqual(store.get("__SERVER_FUNCTION_DATA__"), {
    greet: {
      "[\"Ada\"]": "hello Ada",
    },
  });
});

test("createRouteRequest creates a valid request for relative route paths", () => {
  const request = createRouteRequest("/");

  assert.equal(request.url, "http://localhost/");
});

test("createRouteRequest reuses the active server request when one exists", async () => {
  const raw = new Request("http://example.test/dashboard");
  const store = new Map([["honoContext", { req: { raw } }]]);

  await ssrStorage.run(store, async () => {
    assert.equal(createRouteRequest("/dashboard"), raw);
  });
});
