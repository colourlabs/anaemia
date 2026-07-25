import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { createManifestStore } = await import("../dist/runtime/server/manifest.js");

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-manifest-test-"));
}

test("createManifestStore: getSnapshot returns empty state before load", () => {
  const dir = createTmpDir();
  try {
    const env = {
      port: 3000,
      isDev: false,
      devServerUrl: "http://localhost:4445",
      templatePath: path.join(dir, ".anaemia/client/index.html"),
      manifestPath: path.join(dir, ".anaemia/route-manifest.json"),
      clientDistPath: path.join(dir, ".anaemia/client"),
    };

    const store = createManifestStore(env);
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.template, "");
    assert.equal(snapshot.manifest, null);
    assert.deepEqual(snapshot.sortedRoutes, []);
    assert.equal(snapshot.staticRoutes.size, 0);
    assert.equal(snapshot.loaderRoutes.size, 0);
    assert.equal(snapshot.guardRoutes.size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createManifestStore: loads manifest from filesystem in production", async () => {
  const dir = createTmpDir();
  try {
    const manifest = {
      routes: [
        {
          urlPattern: "/",
          chunkName: "index",
          params: [],
          isStatic: true,
          hasLoader: false,
          hasGuard: false,
          serverFunctionIds: [],
        },
        {
          urlPattern: "/dashboard",
          chunkName: "dashboard",
          params: [],
          isStatic: false,
          hasLoader: true,
          hasGuard: true,
          serverFunctionIds: ["getUser"],
        },
      ],
      chunks: {},
      errors: {},
    };

    fs.mkdirSync(path.join(dir, ".anaemia/client"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".anaemia/route-manifest.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, ".anaemia/client/index.html"), "<html><body>template</body></html>");

    const env = {
      port: 3000,
      isDev: false,
      devServerUrl: "http://localhost:4445",
      templatePath: path.join(dir, ".anaemia/client/index.html"),
      manifestPath: path.join(dir, ".anaemia/route-manifest.json"),
      clientDistPath: path.join(dir, ".anaemia/client"),
    };

    const store = createManifestStore(env);
    await store.load();
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.template, "<html><body>template</body></html>");
    assert.equal(snapshot.manifest.routes.length, 2);
    assert.ok(snapshot.staticRoutes.has("/"));
    assert.ok(snapshot.loaderRoutes.has("/dashboard"));
    assert.ok(snapshot.guardRoutes.has("/dashboard"));
    assert.ok(!snapshot.staticRoutes.has("/dashboard"));
    assert.ok(!snapshot.loaderRoutes.has("/"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createManifestStore: sorts routes after loading", async () => {
  const dir = createTmpDir();
  try {
    const manifest = {
      routes: [
        { urlPattern: "/users/:id", chunkName: "u", params: ["id"], isStatic: false, hasLoader: false, hasGuard: false, serverFunctionIds: [] },
        { urlPattern: "/users", chunkName: "us", params: [], isStatic: true, hasLoader: false, hasGuard: false, serverFunctionIds: [] },
      ],
      chunks: {},
      errors: {},
    };

    fs.mkdirSync(path.join(dir, ".anaemia"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".anaemia/route-manifest.json"), JSON.stringify(manifest));

    const env = {
      port: 3000,
      isDev: false,
      devServerUrl: "http://localhost:4445",
      templatePath: path.join(dir, ".anaemia/client/index.html"),
      manifestPath: path.join(dir, ".anaemia/route-manifest.json"),
      clientDistPath: path.join(dir, ".anaemia/client"),
    };

    const store = createManifestStore(env);
    await store.load();
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.sortedRoutes.length, 2);
    assert.equal(snapshot.sortedRoutes[0].urlPattern, "/users/:id");
    assert.equal(snapshot.sortedRoutes[1].urlPattern, "/users");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createManifestStore: handles missing manifest file gracefully", async () => {
  const dir = createTmpDir();
  try {
    const env = {
      port: 3000,
      isDev: false,
      devServerUrl: "http://localhost:4445",
      templatePath: path.join(dir, ".anaemia/client/index.html"),
      manifestPath: path.join(dir, ".anaemia/route-manifest.json"),
      clientDistPath: path.join(dir, ".anaemia/client"),
    };

    const store = createManifestStore(env);
    await store.load();
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.manifest, null);
    assert.deepEqual(snapshot.sortedRoutes, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createManifestStore: handles missing template file gracefully", async () => {
  const dir = createTmpDir();
  try {
    const manifest = {
      routes: [
        { urlPattern: "/", chunkName: "index", params: [], isStatic: true, hasLoader: false, hasGuard: false, serverFunctionIds: [] },
      ],
      chunks: {},
      errors: {},
    };

    fs.mkdirSync(path.join(dir, ".anaemia"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".anaemia/route-manifest.json"), JSON.stringify(manifest));

    const env = {
      port: 3000,
      isDev: false,
      devServerUrl: "http://localhost:4445",
      templatePath: path.join(dir, ".anaemia/client/index.html"),
      manifestPath: path.join(dir, ".anaemia/route-manifest.json"),
      clientDistPath: path.join(dir, ".anaemia/client"),
    };

    const store = createManifestStore(env);
    await store.load();
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.template, "");
    assert.equal(snapshot.manifest.routes.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createManifestStore: handles invalid JSON in manifest gracefully", async () => {
  const dir = createTmpDir();
  try {
    fs.mkdirSync(path.join(dir, ".anaemia"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".anaemia/route-manifest.json"), "not json");

    const env = {
      port: 3000,
      isDev: false,
      devServerUrl: "http://localhost:4445",
      templatePath: path.join(dir, ".anaemia/client/index.html"),
      manifestPath: path.join(dir, ".anaemia/route-manifest.json"),
      clientDistPath: path.join(dir, ".anaemia/client"),
    };

    const store = createManifestStore(env);
    await store.load();
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.manifest, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
