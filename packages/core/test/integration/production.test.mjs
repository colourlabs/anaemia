import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, "../../../../templates/base-app");

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const workspaceRoot = path.resolve(__dirname, "../../../..");

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-prod-test-"));
  fs.cpSync(templateDir, dir, {
    recursive: true,
    filter: (src) => !["node_modules", ".anaemia", ".rspack", "dist"].includes(path.basename(src)),
  });
  // The fixture needs its own node_modules: the HMR suite runs `anaemia dev`
  // straight from the template, so any rewiring done through a shared symlink
  // would corrupt the install the HMR test depends on.
  fs.cpSync(path.join(templateDir, "node_modules"), path.join(dir, "node_modules"), {
    recursive: true,
  });

  // The template ships its node_modules pre-installed against the last
  // published release, so point every @anaemia/* package at the freshly built
  // workspace source. Otherwise the fixture would exercise the old published
  // CLI/core (no `.config.ts` guard detection, no static-cache guard isolation)
  // and the assertions below would fail.
  //
  // solid-js and @solidjs/router must come from the same copy the workspace
  // core compiles against: Solid's context implementations are keyed on module
  // identity, so mixing the template's (newer) install with the workspace
  // core's router makes the route/context symbols drift, taking every guarded
  // or loadered page down with "reading 'id' of undefined".
  rewireAnaemiaLinks(dir);
  rewireSolidLinks(dir);
  return dir;
}

function rewireAnaemiaLinks(dir) {
  for (const name of ["core", "bundler", "cli", "plugin-mdx", "eslint-plugin"]) {
    const target = path.join(workspaceRoot, "packages", name);
    const linkPath = path.join(dir, "node_modules/@anaemia", name);
    try {
      fs.unlinkSync(linkPath);
    } catch {
      // may be absent if the template stops shipping it
    }
    fs.symlinkSync(target, linkPath, "dir");
  }
}

function rewireSolidLinks(dir) {
  const workspaceNodeModules = path.join(workspaceRoot, "node_modules", ".pnpm");

  // the workspace core may pin exactly the solid-js version it supports; read
  // it from the local manifest rather than guessing at a scope range.
  const corePkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "packages/core/package.json"), "utf8"));
  const solidSpec = corePkg.peerDependencies?.["solid-js"] ?? "^1.9.0";
  const solidVersion = solidSpec.replace(/[~^]/, "");
  const solidEscaped = solidVersion.replace(/\./g, "\\.");

  const solidEntry = fs
    .readdirSync(workspaceNodeModules)
    .find((entry) => new RegExp(`^solid-js@${solidEscaped}$`).test(entry));
  const routerEntry = fs
    .readdirSync(workspaceNodeModules)
    .find((entry) => new RegExp(`^@solidjs\\+router@[^_]+_solid-js@${solidEscaped}$`).test(entry));

  const links = [];
  if (solidEntry) {
    links.push([
      path.join(dir, "node_modules", "solid-js"),
      path.join(workspaceNodeModules, solidEntry, "node_modules", "solid-js"),
    ]);
  }
  if (routerEntry) {
    links.push([
      path.join(dir, "node_modules", "@solidjs", "router"),
      path.join(workspaceNodeModules, routerEntry, "node_modules", "@solidjs", "router"),
    ]);
  }

  for (const [linkPath, target] of links) {
    try {
      fs.unlinkSync(linkPath);
    } catch {
      // fine, may be absent
    }
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(target, linkPath, "dir");
  }
}

function writeFixtureRoutes(dir) {
  const routesDir = path.join(dir, "src/routes");

  // neutralize the template's placeholder root guard so only /admin is guarded
  fs.writeFileSync(path.join(routesDir, "_layout.config.ts"), "export const config = { guards: [] };\n");

  fs.writeFileSync(
    path.join(routesDir, "admin.tsx"),
    [
      `export default function Admin() {`,
      `  return (`,
      `    <main>`,
      `      <h1>admin area</h1>`,
      `    </main>`,
      `  );`,
      `}`,
      ``,
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(routesDir, "admin.config.ts"),
    [
      `import type { GuardFn } from "@anaemia/core";`,
      ``,
      `const adminGuard: GuardFn = async ({ request }) => {`,
      `  if (new URL(request.url).searchParams.get("allow") === "1") return;`,
      `  return { redirect: "/login", status: 307 };`,
      `};`,
      ``,
      `export const config = {`,
      `  guards: [adminGuard],`,
      `};`,
      ``,
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(routesDir, "[...slug].tsx"),
    [
      `import { useParams } from "@solidjs/router";`,
      ``,
      `export default function CatchAll() {`,
      `  const params = useParams();`,
      `  return (`,
      `    <main>`,
      `      <h1>catch-all page</h1>`,
      `      <p data-testid="slug">{params.slug}</p>`,
      `    </main>`,
      `  );`,
      `}`,
      ``,
    ].join("\n"),
  );
}

function runBuild(fixtureDir) {
  const bin = path.join(fixtureDir, "node_modules/.bin/anaemia");
  return spawnSync(bin, ["build"], {
    cwd: fixtureDir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 180_000,
  });
}

function startServer(fixtureDir, port) {
  return spawn(process.execPath, [path.join(fixtureDir, ".anaemia/server/index.js")], {
    cwd: fixtureDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  });
}

async function waitForServer(baseUrl, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready at ${baseUrl}`);
}

test("integration - production build, guards & catch-all routes", async (t) => {
  const fixtureDir = createFixture();
  writeFixtureRoutes(fixtureDir);

  const port = await getFreePort();
  const baseUrl = `http://localhost:${port}`;

  let serverProcess = null;
  let serverOutput = "";
  let browser = null;

  t.after(async () => {
    if (browser) await browser.close();
    if (serverProcess?.pid) {
      try {
        process.kill(-serverProcess.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 3 });
  });

  await t.test("builds production artifacts and flags guarded routes", () => {
    const build = runBuild(fixtureDir);
    assert.equal(build.status, 0, `anaemia build failed:\n${build.stdout}\n${build.stderr}`);

    assert.ok(fs.existsSync(path.join(fixtureDir, ".anaemia/server/index.js")), "server bundle missing");
    assert.ok(fs.existsSync(path.join(fixtureDir, ".anaemia/client/index.html")), "client template missing");
    assert.ok(fs.existsSync(path.join(fixtureDir, ".anaemia/client/assets")), "client assets missing");

    const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, ".anaemia/route-manifest.json"), "utf8"));

    const admin = manifest.routes.find((r) => r.urlPattern === "/admin");
    assert.ok(admin, "/admin missing from manifest");
    assert.equal(admin.hasGuard, true, "config guard should mark the route as guarded");
    assert.equal(admin.isStatic, false, "guarded routes must not be eligible for the static HTML cache");

    const catchAll = manifest.routes.find((r) => r.urlPattern === "/*");
    assert.ok(catchAll, "catch-all route missing from manifest");
    assert.equal(catchAll.type, "catch-all");
    assert.ok(catchAll.params.includes("slug"));
    assert.equal(catchAll.isStatic, true);
  });

  await t.test("starts the production server", async () => {
    serverProcess = startServer(fixtureDir, port);
    serverProcess.stdout.on("data", (d) => (serverOutput += d.toString()));
    serverProcess.stderr.on("data", (d) => (serverOutput += d.toString()));

    await waitForServer(baseUrl);
  });

  await t.test("serves SSR HTML and exposes the hydration data script", async () => {
    const res = await fetch(baseUrl, { redirect: "manual" });
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /<h1[^>]*>anaemia/, "home page should render the template's hero heading");
    assert.match(html, /id="__ANAEMIA_DATA__"/, "hydration data script should be embedded in SSR HTML");
  });

  await t.test("hydrates the client bundle without errors", async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("pageerror", (err) => consoleErrors.push(err));

    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const titleText = await page.textContent("h1");
    assert.match(titleText ?? "", /anaemia/, "client bundle should hydrate and render the home page");
    assert.equal(
      consoleErrors.length,
      0,
      `client errors during production hydration: ${consoleErrors.map((e) => e.message).join(", ")}`,
    );
  });

  await t.test("guards redirect unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), "/login");
    assert.equal(res.headers.get("x-anaemia-cache"), null, "guarded responses must never be cache hits");
  });

  await t.test("guards admit requests that satisfy the condition", async () => {
    const res = await fetch(`${baseUrl}/admin?allow=1`, { redirect: "manual" });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /admin area/);
    assert.equal(res.headers.get("x-anaemia-cache"), null);

    const followUp = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
    assert.equal(followUp.status, 307, "an allowed render must not poison the guard for subsequent requests");
  });

  await t.test("catch-all route matches nested paths and exposes the slug param", async () => {
    const res = await fetch(`${baseUrl}/foo/bar/baz`, { redirect: "manual" });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /catch-all page/);
    assert.match(html, /data-testid="slug">foo\/bar\/baz</);
  });

  await t.test("static pages are served from the HTML cache on repeat requests", async () => {
    const uniquePath = `/cached/${Date.now()}`;
    const first = await fetch(`${baseUrl}${uniquePath}`, { redirect: "manual" });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("x-anaemia-cache"), null);

    const second = await fetch(`${baseUrl}${uniquePath}`, { redirect: "manual" });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("x-anaemia-cache"), "HIT");
  });
});
