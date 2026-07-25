import test from "node:test";
import assert from "node:assert/strict";

const { runGuards } = await import("../dist/runtime/server/guards.js");

function createCtx(overrides = {}) {
  return {
    params: {},
    request: new Request("http://localhost/"),
    url: "/",
    ...overrides,
  };
}

function createRegistry(pattern, ...guardFns) {
  const registry = new Map();
  registry.set(pattern, [async () => guardFns]);
  return registry;
}

// no guards

test("runGuards: returns null when no guards registered", async () => {
  const registry = new Map();
  const result = await runGuards(registry, "/", createCtx());
  assert.equal(result, null);
});

test("runGuards: returns null when pattern has no guards", async () => {
  const registry = new Map();
  registry.set("/other", [async () => []]);
  const result = await runGuards(registry, "/", createCtx());
  assert.equal(result, null);
});

// void/undefined returns

test("runGuards: returns null when guard returns void", async () => {
  const registry = createRegistry("/", () => {});
  const result = await runGuards(registry, "/", createCtx());
  assert.equal(result, null);
});

test("runGuards: returns null when guard returns undefined", async () => {
  const registry = createRegistry("/", () => undefined);
  const result = await runGuards(registry, "/", createCtx());
  assert.equal(result, null);
});

// redirect

test("runGuards: returns redirect when guard redirects", async () => {
  const registry = createRegistry("/", () => ({ redirect: "/login" }));
  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { redirect: "/login" });
});

test("runGuards: returns redirect with status", async () => {
  const registry = createRegistry("/", () => ({ redirect: "/login", status: 301 }));
  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { redirect: "/login", status: 301 });
});

test("runGuards: returns redirect with default status 302", async () => {
  const registry = createRegistry("/", () => ({ redirect: "/login" }));
  const result = await runGuards(registry, "/", createCtx());
  assert.equal(result.status, undefined);
});

// status response

test("runGuards: returns status when guard returns status", async () => {
  const registry = createRegistry("/", () => ({ status: 403, body: "Forbidden" }));
  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { status: 403, body: "Forbidden" });
});

// guard execution chain

test("runGuards: stops at first guard that returns a result", async () => {
  let secondCalled = false;
  const registry = new Map();
  registry.set("/", [
    async () => [
      () => ({ redirect: "/blocked" }),
      () => {
        secondCalled = true;
        return { redirect: "/also-blocked" };
      },
    ],
  ]);

  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { redirect: "/blocked" });
  assert.ok(!secondCalled);
});

test("runGuards: continues through guards that return void", async () => {
  const registry = new Map();
  registry.set("/", [
    async () => [() => {}, () => ({ redirect: "/final" })],
  ]);

  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { redirect: "/final" });
});

// async guards

test("runGuards: supports async guards", async () => {
  const registry = createRegistry("/", async () => {
    await new Promise((r) => setTimeout(r, 10));
    return { redirect: "/async-redirect" };
  });

  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { redirect: "/async-redirect" });
});

test("runGuards: supports multiple guard chains", async () => {
  const registry = new Map();
  registry.set("/", [async () => [() => {}]]);
  registry.set("/", [
    async () => [() => {}],
    async () => [() => ({ redirect: "/from-chain-2" })],
  ]);

  const result = await runGuards(registry, "/", createCtx());
  assert.deepEqual(result, { redirect: "/from-chain-2" });
});

// context

test("runGuards: passes params to guard context", async () => {
  let receivedParams;
  const registry = createRegistry("/users/:id", (ctx) => {
    receivedParams = ctx.params;
  });

  await runGuards(registry, "/users/:id", createCtx({ params: { id: "42" } }));
  assert.deepEqual(receivedParams, { id: "42" });
});

test("runGuards: passes request to guard context", async () => {
  let receivedRequest;
  const req = new Request("http://localhost/dashboard");
  const registry = createRegistry("/", (ctx) => {
    receivedRequest = ctx.request;
  });

  await runGuards(registry, "/", createCtx({ request: req }));
  assert.equal(receivedRequest, req);
});

test("runGuards: passes url to guard context", async () => {
  let receivedUrl;
  const registry = createRegistry("/", (ctx) => {
    receivedUrl = ctx.url;
  });

  await runGuards(registry, "/", createCtx({ url: "/some/path" }));
  assert.equal(receivedUrl, "/some/path");
});

// multiple guard loaders

test("runGuards: executes multiple guard loaders for same pattern", async () => {
  let loader1Called = false;
  let loader2Called = false;
  const registry = new Map();
  registry.set("/", [
    async () => {
      loader1Called = true;
      return [];
    },
    async () => {
      loader2Called = true;
      return [];
    },
  ]);

  const result = await runGuards(registry, "/", createCtx());
  assert.equal(result, null);
  assert.ok(loader1Called);
  assert.ok(loader2Called);
});
