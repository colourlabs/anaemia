import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRoutes, scanServerRoutes } from "../dist/router/scan.js";

function createTmpProject(structure) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-router-test-"));
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// scanServerRoutes

test("scanServerRoutes finds _route files", () => {
  const dir = createTmpProject({
    "src/routes/_route.ts": "export const GET = () => new Response('root');",
    "src/routes/users/_route.ts": "export const GET = () => new Response('users');",
    "src/routes/users/[id]/_route.ts": "export const GET = () => new Response('user');",
  });

  try {
    const routes = scanServerRoutes(dir);

    assert.equal(routes.length, 3);
    assert.ok(routes.some((r) => r.urlPattern === "/"));
    assert.ok(routes.some((r) => r.urlPattern === "/users"));
    assert.ok(routes.some((r) => r.urlPattern === "/users/:id"));
  } finally {
    cleanup(dir);
  }
});

test("scanServerRoutes converts dynamic segments to :param", () => {
  const dir = createTmpProject({
    "src/routes/products/[slug]/_route.ts": "export const GET = () => new Response('product');",
    "src/routes/orders/[...all]/_route.ts": "export const GET = () => new Response('orders');",
  });

  try {
    const routes = scanServerRoutes(dir);

    assert.equal(routes.length, 2);
    assert.ok(routes.some((r) => r.urlPattern === "/products/:slug"));
    assert.ok(routes.some((r) => r.urlPattern === "/orders/*"));
  } finally {
    cleanup(dir);
  }
});

test("scanServerRoutes returns absolute filePaths", () => {
  const dir = createTmpProject({
    "src/routes/_route.ts": "export const GET = () => new Response('ok');",
  });

  try {
    const routes = scanServerRoutes(dir);

    assert.equal(routes.length, 1);
    assert.ok(path.isAbsolute(routes[0].filePath));
    assert.ok(routes[0].filePath.endsWith("_route.ts"));
  } finally {
    cleanup(dir);
  }
});

test("scanServerRoutes returns empty array when no _route files exist", () => {
  const dir = createTmpProject({
    "src/routes/index.tsx": "export default function Home() { return <div />; }",
  });

  try {
    const routes = scanServerRoutes(dir);
    assert.equal(routes.length, 0);
  } finally {
    cleanup(dir);
  }
});

// scanRoutes

test("scanRoutes discovers page routes", async () => {
  const dir = createTmpProject({
    "src/routes/index.tsx": "export default function Home() { return <div />; }",
    "src/routes/about.tsx": "export default function About() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 2);
    assert.ok(routes.some((r) => r.urlPattern === "/"));
    assert.ok(routes.some((r) => r.urlPattern === "/about"));
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes handles dynamic segments", async () => {
  const dir = createTmpProject({
    "src/routes/users/[id].tsx": "export default function User() { return <div />; }",
    "src/routes/posts/[slug]/index.tsx": "export default function Post() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 2);
    assert.ok(routes.some((r) => r.urlPattern === "/users/:id"));
    assert.ok(routes.some((r) => r.urlPattern === "/posts/:slug"));
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes handles catch-all routes", async () => {
  const dir = createTmpProject({
    "src/routes/[...slug].tsx": "export default function CatchAll() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 1);
    assert.equal(routes[0].urlPattern, "/*");
    assert.equal(routes[0].type, "catch-all");
    assert.ok(routes[0].params.includes("slug"));
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes skips layout files", async () => {
  const dir = createTmpProject({
    "src/routes/_layout.tsx": "export default function Layout(props) { return props.children; }",
    "src/routes/index.tsx": "export default function Home() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 1);
    assert.equal(routes[0].urlPattern, "/");
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes skips config files", async () => {
  const dir = createTmpProject({
    "src/routes/index.tsx": "export default function Home() { return <div />; }",
    "src/routes/_layout.config.ts": "export default { guards: [] };",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 1);
    assert.equal(routes[0].urlPattern, "/");
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes resolves layout chain for nested routes", async () => {
  const dir = createTmpProject({
    "src/routes/_layout.tsx": "export default function RootLayout(props) { return props.children; }",
    "src/routes/dashboard/_layout.tsx": "export default function DashLayout(props) { return props.children; }",
    "src/routes/dashboard/settings.tsx": "export default function Settings() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 1);
    assert.equal(routes[0].urlPattern, "/dashboard/settings");
    assert.equal(routes[0].layouts.length, 2);
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes generates correct chunk names", async () => {
  const dir = createTmpProject({
    "src/routes/index.tsx": "export default function Home() { return <div />; }",
    "src/routes/users/[id].tsx": "export default function User() { return <div />; }",
    "src/routes/[...rest].tsx": "export default function Rest() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    const home = routes.find((r) => r.urlPattern === "/");
    const user = routes.find((r) => r.urlPattern === "/users/:id");
    const rest = routes.find((r) => r.urlPattern === "/*");

    assert.equal(home.chunkName, "index");
    assert.equal(user.chunkName, "users-param-id");
    assert.equal(rest.chunkName, "catchall-rest");
  } finally {
    cleanup(dir);
  }
});

test("scanRoutes extracts params from file paths", async () => {
  const dir = createTmpProject({
    "src/routes/a/[category]/b/[id].tsx": "export default function Page() { return <div />; }",
  });

  try {
    const routes = await scanRoutes(dir);

    assert.equal(routes.length, 1);
    assert.deepEqual(routes[0].params, ["category", "id"]);
  } finally {
    cleanup(dir);
  }
});
