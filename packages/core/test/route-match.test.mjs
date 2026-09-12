import test from "node:test";
import assert from "node:assert/strict";

const { matchRoute, sortRoutes } = await import("../dist/runtime/server/route-match.js");

function createRoutes(routes) {
  return routes;
}

// sortRoutes

test("sortRoutes: deeper routes score higher than shallower", () => {
  const routes = createRoutes([
    { urlPattern: "/users/:id", chunkName: "users-param-id", params: ["id"] },
    { urlPattern: "/users", chunkName: "users", params: [] },
  ]);

  const sorted = sortRoutes(routes);
  assert.equal(sorted[0].urlPattern, "/users/:id");
  assert.equal(sorted[1].urlPattern, "/users");
});

test("sortRoutes: catch-all routes score lowest", () => {
  const routes = createRoutes([
    { urlPattern: "/*", chunkName: "catchall", params: ["rest"] },
    { urlPattern: "/users/:id", chunkName: "users-param-id", params: ["id"] },
    { urlPattern: "/users", chunkName: "users", params: [] },
  ]);

  const sorted = sortRoutes(routes);
  assert.equal(sorted[0].urlPattern, "/users/:id");
  assert.equal(sorted[1].urlPattern, "/users");
  assert.equal(sorted[2].urlPattern, "/*");
});

test("sortRoutes: deeper static routes score higher than shallower", () => {
  const routes = createRoutes([
    { urlPattern: "/a/b/c", chunkName: "abc", params: [] },
    { urlPattern: "/a", chunkName: "a", params: [] },
  ]);

  const sorted = sortRoutes(routes);
  assert.equal(sorted[0].urlPattern, "/a/b/c");
  assert.equal(sorted[1].urlPattern, "/a");
});

test("sortRoutes: within same depth, dynamic segments score lower than static", () => {
  const routes = createRoutes([
    { urlPattern: "/users/:id", chunkName: "param", params: ["id"] },
    { urlPattern: "/about", chunkName: "static", params: [] },
  ]);

  const sorted = sortRoutes(routes);
  assert.equal(sorted[0].urlPattern, "/users/:id");
  assert.equal(sorted[1].urlPattern, "/about");
});

// matchRoute

test("matchRoute: matches exact static route", () => {
  const routes = createRoutes([
    { urlPattern: "/about", chunkName: "about", params: [] },
    { urlPattern: "/", chunkName: "index", params: [] },
  ]);

  const result = matchRoute({ routes, chunks: {} }, "/about");
  assert.equal(result.activeChunk, "about");
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.params, {});
});

test("matchRoute: matches root path", () => {
  const routes = createRoutes([
    { urlPattern: "/about", chunkName: "about", params: [] },
    { urlPattern: "/", chunkName: "index", params: [] },
  ]);

  const result = matchRoute({ routes, chunks: {} }, "/");
  assert.equal(result.activeChunk, "index");
  assert.equal(result.statusCode, 200);
});

test("matchRoute: extracts dynamic params", () => {
  const routes = createRoutes([{ urlPattern: "/users/:id", chunkName: "users-param-id", params: ["id"] }]);

  const result = matchRoute({ routes, chunks: {} }, "/users/42");
  assert.equal(result.activeChunk, "users-param-id");
  assert.equal(result.params.id, "42");
});

test("matchRoute: extracts multiple dynamic params", () => {
  const routes = createRoutes([
    { urlPattern: "/users/:userId/posts/:postId", chunkName: "user-post", params: ["userId", "postId"] },
  ]);

  const result = matchRoute({ routes, chunks: {} }, "/users/5/posts/99");
  assert.equal(result.params.userId, "5");
  assert.equal(result.params.postId, "99");
});

test("matchRoute: matches catch-all route", () => {
  const routes = createRoutes([{ urlPattern: "/*", chunkName: "catchall", params: ["rest"] }]);

  const result = matchRoute({ routes, chunks: {} }, "/any/thing/goes/here");
  assert.equal(result.activeChunk, "catchall");
  assert.equal(result.params.catchall, "any/thing/goes/here");
});

test("matchRoute: returns 404 for unmatched route", () => {
  const routes = createRoutes([{ urlPattern: "/about", chunkName: "about", params: [] }]);

  const result = matchRoute({ routes, chunks: {} }, "/nonexistent");
  assert.equal(result.activeChunk, "route-404");
  assert.equal(result.statusCode, 404);
});

test("matchRoute: returns 404 with error page pattern when available", () => {
  const manifest = {
    routes: createRoutes([{ urlPattern: "/about", chunkName: "about", params: [] }]),
    chunks: {},
    errors: { 404: "/not-found" },
  };

  const result = matchRoute(manifest, "/nonexistent");
  assert.equal(result.activeChunk, "route-404");
  assert.equal(result.targetPattern, "/not-found");
  assert.equal(result.statusCode, 404);
});

test("matchRoute: prefers static over dynamic when both match", () => {
  const routes = createRoutes([
    { urlPattern: "/users/:id", chunkName: "users-param-id", params: ["id"] },
    { urlPattern: "/users/new", chunkName: "users-new", params: [] },
  ]);

  const result = matchRoute({ routes, chunks: {} }, "/users/new");
  assert.equal(result.activeChunk, "users-new");
});

test("matchRoute: accepts pre-sorted routes", () => {
  const routes = createRoutes([
    { urlPattern: "/users/:id", chunkName: "users-param-id", params: ["id"] },
    { urlPattern: "/users/new", chunkName: "users-new", params: [] },
  ]);

  const sorted = sortRoutes(routes);
  const result = matchRoute({ routes, chunks: {} }, "/users/new", sorted);
  assert.equal(result.activeChunk, "users-new");
});
