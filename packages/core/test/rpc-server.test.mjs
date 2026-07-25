import test from "node:test";
import assert from "node:assert/strict";

const { Hono } = await import("hono");
const { registerRpcRoute } = await import("../dist/runtime/server/rpc.js");
const { serverFunctionsRegistry } = await import("../dist/runtime/context.js");

function createApp() {
  const app = new Hono();
  registerRpcRoute(app);
  return app;
}

async function request(app, method, path, options = {}) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: options.headers ?? {},
    body: options.body ?? undefined,
  });
  return app.fetch(req);
}

// Cleanup after each test
test.afterEach(() => {
  serverFunctionsRegistry.clear();
});

// basic routing

test("RPC: returns 404 when function id is missing", async () => {
  const app = createApp();
  const res = await request(app, "POST", "/_rpc");
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "RPC function not found");
});

test("RPC: returns 404 when function id is not registered", async () => {
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=nonexistent", {
    headers: { "content-length": "2" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 404);
});

test("RPC: returns 400 for non-array body", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "content-type": "application/json", "content-length": "20" },
    body: JSON.stringify({ not: "array" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Invalid request body");
});

test("RPC: returns 400 for invalid JSON", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "content-type": "application/json", "content-length": "10" },
    body: "not json",
  });
  assert.equal(res.status, 400);
});

// payload size

test("RPC: returns 413 when payload exceeds 512KB", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "content-length": String(512_001) },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.error, "Payload too large");
});

test("RPC: accepts payload at exactly 512KB", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "content-length": String(512_000) },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 200);
});

// function execution

test("RPC: executes registered function with arguments", async () => {
  serverFunctionsRegistry.set("add", (a, b) => a + b);
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=add", {
    headers: { "content-type": "application/json", "content-length": "10" },
    body: JSON.stringify([2, 3]),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body, 5);
});

test("RPC: executes async function", async () => {
  serverFunctionsRegistry.set("asyncFn", async (x) => x * 2);
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=asyncFn", {
    headers: { "content-type": "application/json", "content-length": "5" },
    body: JSON.stringify([21]),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body, 42);
});

test("RPC: returns 500 when function throws", async () => {
  serverFunctionsRegistry.set("throwFn", () => {
    throw new Error("something broke");
  });
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=throwFn", {
    headers: { "content-type": "application/json", "content-length": "2" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "something broke");
});

test("RPC: returns 500 with generic message for non-Error throw", async () => {
  serverFunctionsRegistry.set("throwStr", () => {
    throw "string error";
  });
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=throwStr", {
    headers: { "content-type": "application/json", "content-length": "2" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "Internal server error");
});

test("RPC: passes no arguments", async () => {
  serverFunctionsRegistry.set("noArgs", () => "hello");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=noArgs", {
    headers: { "content-type": "application/json", "content-length": "2" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body, "hello");
});

test("RPC: passes complex objects", async () => {
  serverFunctionsRegistry.set("echo", (obj) => obj);
  const app = createApp();
  const payload = { nested: { arr: [1, 2, 3] } };
  const res = await request(app, "POST", "/_rpc?id=echo", {
    headers: { "content-type": "application/json", "content-length": String(JSON.stringify(payload).length) },
    body: JSON.stringify([payload]),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, payload);
});
