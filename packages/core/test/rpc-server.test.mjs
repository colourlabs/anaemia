import test from "node:test";
import assert from "node:assert/strict";

const { Hono } = await import("hono");
const { registerRpcRoute } = await import("../dist/runtime/server/rpc.js");
const { serverFunctionsRegistry, registerRpcPolicy } = await import("../dist/runtime/context.js");
const { createRpcToken, setRpcSecret } = await import("../dist/runtime/server/rpc-security.js");

// deterministic secret so tokens signed in tests verify against the handler.
setRpcSecret("rpc-server-test-secret");

function createApp(options) {
  const app = new Hono();
  registerRpcRoute(app, options);
  return app;
}

function rpcToken() {
  return createRpcToken();
}

function authHeaders(overrides = {}) {
  return { "x-anaemia-token": rpcToken(), ...overrides };
}

async function request(app, method, path, options = {}) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: options.headers ?? {},
    body: options.body ?? undefined,
    // required by undici when body is a ReadableStream (chunked test)
    duplex: "half",
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
    headers: { ...authHeaders(), "content-length": "2" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 404);
});

test("RPC: returns 400 for non-array body", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { ...authHeaders(), "content-type": "application/json" },
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
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: "not json",
  });
  assert.equal(res.status, 400);
});

// payload size

test("RPC: returns 413 when content-length header exceeds 512KB", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { ...authHeaders(), "content-length": String(512_001) },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.error, "Payload too large");
});

test("RPC: returns 413 for chunked body over 512KB (streaming cap)", async () => {
  serverFunctionsRegistry.set("testFn", (blob) => blob.length);
  const app = createApp();
  const body = streamJson(["A".repeat(900_000)]);
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: authHeaders(),
    body,
  });
  assert.equal(res.status, 413);
  const result = await res.json();
  assert.equal(result.error, "Payload too large");
});

test("RPC: accepts payload at exactly 512KB", async () => {
  serverFunctionsRegistry.set("testFn", (blob) => blob.length);
  const app = createApp();
  const payload = JSON.stringify(["B".repeat(512_000 - 4)]);
  assert.equal(payload.length, 512_000);
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { ...authHeaders(), "content-length": String(payload.length) },
    body: payload,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body, 512_000 - 4);
});

// endpoint security

test("RPC: rejects calls without a token", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: rejects a forged token", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "x-anaemia-token": rpcToken().replace(/^[^.]+/, "b2RwdQ") },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: rejects a tampered signature", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const token = rpcToken();
  const sig = token.split(".")[1];
  const flipped = Buffer.from(Buffer.from(sig, "base64url").map((b) => b ^ 0xff)).toString("base64url");
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "x-anaemia-token": `${token.split(".")[0]}.${flipped}` },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: rejects an expired token", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "x-anaemia-token": createRpcToken({ ttlSeconds: -60 }) },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: rejects a token signed with a different secret", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();

  setRpcSecret("some-other-secret");
  const foreignToken = rpcToken();
  setRpcSecret("rpc-server-test-secret");

  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: { "x-anaemia-token": foreignToken },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: rejects cross-origin requests even with a valid token", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: authHeaders({ origin: "https://evil.example" }),
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: rejects cross-site requests even with a valid token", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: authHeaders({ origin: "http://localhost", "sec-fetch-site": "cross-site" }),
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

test("RPC: accepts same-origin request with a valid token", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: authHeaders({ origin: "http://localhost" }),
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 200);
});

test("RPC: allows an extra configured origin", async () => {
  serverFunctionsRegistry.set("testFn", () => "ok");
  const app = createApp({ allowedOrigins: ["https://stage.example"] });
  const res = await request(app, "POST", "/_rpc?id=testFn", {
    headers: authHeaders({ origin: "https://stage.example" }),
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 200);
});

// per-function authorization policies

test("RPC: a policy denying access returns 403 and does not run the function", async () => {
  let ran = false;
  serverFunctionsRegistry.set("guarded", () => {
    ran = true;
  });
  registerRpcPolicy("guarded", { allow: () => false });

  const app = createApp();
  const denied = await request(app, "POST", "/_rpc?id=guarded", {
    headers: authHeaders(),
    body: JSON.stringify([]),
  });
  assert.equal(denied.status, 403);
  assert.equal(ran, false);
});

test("RPC: a policy allowing access lets the function run", async () => {
  serverFunctionsRegistry.set("guarded", () => "secret data");
  registerRpcPolicy("guarded", { allow: (ctx) => ctx.request.headers.get("authorization") === "Bearer right" });

  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=guarded", {
    headers: authHeaders({ authorization: "Bearer right" }),
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body, "secret data");
});

test("RPC: a throwing policy is treated as denied", async () => {
  serverFunctionsRegistry.set("guarded", () => "ok");
  registerRpcPolicy("guarded", {
    allow: () => {
      throw new Error("boom");
    },
  });
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=guarded", {
    headers: authHeaders(),
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 403);
});

// function execution

test("RPC: executes registered function with arguments", async () => {
  serverFunctionsRegistry.set("add", (a, b) => a + b);
  const app = createApp();
  const res = await request(app, "POST", "/_rpc?id=add", {
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
    body: JSON.stringify([payload]),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, payload);
});

function streamJson(payload) {
  const enc = new TextEncoder();
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= payload.length) {
        controller.close();
        return;
      }
      const chunk = enc.encode(payload.slice(offset, offset + 16384));
      offset += chunk.length;
      controller.enqueue(chunk);
    },
  });
}
