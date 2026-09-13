import test from "node:test";
import assert from "node:assert/strict";

const { createStaticHtmlCache } = await import("../dist/runtime/server/static-html-cache.js");

test("evicts the oldest entry when full (LRU)", () => {
  const cache = createStaticHtmlCache(1_000_000, 2);
  cache.set("/a", "A");
  cache.set("/b", "B");
  cache.set("/c", "C");
  assert.equal(cache.get("/a"), undefined, "oldest should be evicted on overflow");
  assert.equal(cache.get("/b"), "B");
  assert.equal(cache.get("/c"), "C");
});

test("expires entries after maxAge", async () => {
  const cache = createStaticHtmlCache(50, 2);
  cache.set("/a", "A");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cache.get("/a"), undefined, "entry should expire after maxAge");
});

test("refreshes LRU position on read", () => {
  const cache = createStaticHtmlCache(1_000_000, 2);
  cache.set("/a", "A");
  cache.set("/b", "B");
  assert.equal(cache.get("/a"), "A");
  cache.set("/c", "C");
  assert.equal(cache.get("/a"), "A", "recently read entry survives eviction");
  assert.equal(cache.get("/b"), undefined);
});

test("keeps values distinct across keys and allows re-keying", () => {
  const cache = createStaticHtmlCache(1_000_000, 2);
  cache.set("/x", "<h1>x</h1>");
  cache.set("/x", "<h1>x2</h1>");
  assert.equal(cache.get("/x"), "<h1>x2</h1>");
});
