import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, "../../../../templates/base-app");
const pluginEntry = path.resolve(__dirname, "../../dist/index.js");

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

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-mdx-test-"));
  fs.cpSync(templateDir, dir, {
    recursive: true,
    filter: (src) => !["node_modules", ".anaemia", ".rspack", "dist"].includes(path.basename(src)),
  });
  fs.symlinkSync(path.join(templateDir, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}

function writeMdxFixture(dir) {
  const routesDir = path.join(dir, "src/routes");
  const contentDir = path.join(dir, "src/content");

  fs.mkdirSync(contentDir, { recursive: true });

  // neutralize the template's placeholder root guard so routes render directly
  fs.writeFileSync(path.join(routesDir, "_layout.config.ts"), "export const config = { guards: [] };\n");

  fs.writeFileSync(
    path.join(contentDir, "demo.mdx"),
    [`# Hello MDX`, ``, `A paragraph with **bold** text.`, ``].join("\n"),
  );

  fs.writeFileSync(
    path.join(contentDir, "notes.md"),
    [`## Markdown note`, ``, `Plain markdown should compile too.`, ``].join("\n"),
  );

  fs.writeFileSync(
    path.join(routesDir, "mdx-demo.tsx"),
    [
      `import Doc from "../content/demo.mdx";`,
      ``,
      `export default function MdxDemo() {`,
      `  return (`,
      `    <main>`,
      `      <Doc />`,
      `    </main>`,
      `  );`,
      `}`,
      ``,
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(routesDir, "mdx-md.tsx"),
    [
      `import Note from "../content/notes.md";`,
      ``,
      `export default function MdxMd() {`,
      `  return (`,
      `    <main>`,
      `      <Note />`,
      `    </main>`,
      `  );`,
      `}`,
      ``,
    ].join("\n"),
  );

  // MDX resolves `_components.h1` to the built-in string tag unless overridden,
  // so this route proves `<Dynamic>` still renders real components.
  fs.writeFileSync(
    path.join(routesDir, "mdx-custom.tsx"),
    [
      `import Doc from "../content/demo.mdx";`,
      ``,
      `const H1 = (props: { children?: unknown }) => <h1 data-testid="custom-h1">{props.children}</h1>;`,
      ``,
      `export default function MdxCustom() {`,
      `  return (`,
      `    <main>`,
      `      <Doc components={{ h1: H1 }} />`,
      `    </main>`,
      `  );`,
      `}`,
      ``,
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(dir, "anaemia.config.ts"),
    [
      `import { defineConfig } from "@anaemia/core/config";`,
      `import { anaemiaLightningCssPlugin } from "@anaemia/core/plugins";`,
      `import { mdx } from ${JSON.stringify(pluginEntry)};`,
      ``,
      `export default defineConfig({`,
      `  port: 3000,`,
      `  styles: { sass: true, modules: true, typedModules: true },`,
      `  plugins: [anaemiaLightningCssPlugin({ browserslist: ["last 2 versions"] }), mdx()],`,
      `});`,
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

test("integration - MDX plugin compiles, renders and hydrates", async (t) => {
  const fixtureDir = createFixture();
  writeMdxFixture(fixtureDir);

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

  await t.test("builds production artifacts with the MDX rule", () => {
    const build = runBuild(fixtureDir);
    assert.equal(build.status, 0, `anaemia build failed:\n${build.stdout}\n${build.stderr}`);

    assert.ok(fs.existsSync(path.join(fixtureDir, ".anaemia/server/index.js")), "server bundle missing");
    assert.ok(fs.existsSync(path.join(fixtureDir, ".anaemia/client/index.html")), "client template missing");
  });

  await t.test("starts the production server", async () => {
    serverProcess = startServer(fixtureDir, port);
    serverProcess.stdout.on("data", (d) => (serverOutput += d.toString()));
    serverProcess.stderr.on("data", (d) => (serverOutput += d.toString()));

    await waitForServer(baseUrl);
  });

  await t.test("server-renders MDX as native elements", async () => {
    const res = await fetch(`${baseUrl}/mdx-demo`, { redirect: "manual" });
    assert.equal(res.status, 200, serverOutput);
    const html = await res.text();

    assert.match(html, /<h1[^>]*>Hello MDX<\/h1>/, "h1 should render via Dynamic as a native tag");
    assert.match(
      html,
      /<p[^>]*>A paragraph with <strong[^>]*>bold<\/strong> text\.<\/p>/,
      "nested emphasis should render as native tags",
    );
    assert.doesNotMatch(html, /_components/, "MDX internals must not leak into SSR output");
  });

  await t.test("server-renders .md files", async () => {
    const res = await fetch(`${baseUrl}/mdx-md`, { redirect: "manual" });
    assert.equal(res.status, 200, serverOutput);
    const html = await res.text();

    assert.match(html, /<h2[^>]*>Markdown note<\/h2>/);
    assert.match(html, /Plain markdown should compile too\./);
  });

  await t.test("server-renders component overrides passed through the MDX components prop", async () => {
    const res = await fetch(`${baseUrl}/mdx-custom`, { redirect: "manual" });
    assert.equal(res.status, 200, serverOutput);
    const html = await res.text();

    assert.match(html, /data-testid="custom-h1"/);
    assert.match(html, />Hello MDX</);
  });

  await t.test("hydrates MDX pages on the client without errors", async () => {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("pageerror", (err) => consoleErrors.push(err));

    await page.goto(`${baseUrl}/mdx-demo`, { waitUntil: "networkidle" });
    assert.equal(await page.textContent("h1"), "Hello MDX");
    assert.equal(await page.textContent("strong"), "bold");

    await page.goto(`${baseUrl}/mdx-custom`, { waitUntil: "networkidle" });
    assert.equal(await page.getAttribute('[data-testid="custom-h1"]', "data-testid"), "custom-h1");
    assert.equal(await page.textContent('[data-testid="custom-h1"]'), "Hello MDX");

    assert.equal(
      consoleErrors.length,
      0,
      `client errors during MDX hydration: ${consoleErrors.map((e) => e.message).join(", ")}`,
    );
  });
});
