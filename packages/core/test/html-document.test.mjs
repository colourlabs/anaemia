import test from "node:test";
import assert from "node:assert/strict";

const {
  createSSRDocumentFromTemplate,
  createHtmlDocumentShell,
  applyPluginDocumentHooks,
  applyFrameworkDocumentDefaults,
} = await import("../dist/runtime/server/html.js");

const BASIC_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Test App</title>
  <link rel="stylesheet" href="/global.css">
  <script>window.__INIT__ = true;</script>
</head>
<body class="app">
  <div anaemia-entry></div>
</body>
</html>`;

const TEMPLATE_WITH_CUSTOM_ENTRY = `<!doctype html>
<html>
<head>
  <title>Custom</title>
</head>
<body>
  <main anaemia-entry>loading...</main>
</body>
</html>`;

const TEMPLATE_WITH_CONTENT = `<!doctype html>
<html>
<head>
  <title>Content</title>
</head>
<body>
  <nav>nav bar</nav>
  <div anaemia-entry></div>
  <footer>footer</footer>
</body>
</html>`;

// createSSRDocumentFromTemplate

test("createSSRDocumentFromTemplate: parses title", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  assert.equal(doc.head.title, "Test App");
});

test("createSSRDocumentFromTemplate: parses meta tags", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  assert.ok(doc.head.meta.length >= 1);
  assert.equal(doc.head.meta[0]["charset"], "utf-8");
});

test("createSSRDocumentFromTemplate: parses link tags", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  assert.equal(doc.head.links.length, 1);
  assert.equal(doc.head.links[0].rel, "stylesheet");
  assert.equal(doc.head.links[0].href, "/global.css");
});

test("createSSRDocumentFromTemplate: parses script tags in head", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  assert.equal(doc.head.scripts.length, 1);
  assert.equal(doc.head.scripts[0].children, "window.__INIT__ = true;");
});

test("createSSRDocumentFromTemplate: parses html attributes", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  assert.equal(doc.htmlAttrs.lang, "en");
});

test("createSSRDocumentFromTemplate: parses body attributes", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  assert.equal(doc.bodyAttrs.class, "app");
});

test("createSSRDocumentFromTemplate: extracts custom entry element", () => {
  const doc = createSSRDocumentFromTemplate(TEMPLATE_WITH_CUSTOM_ENTRY);
  assert.ok(doc.bodyStart.length === 0 || doc.bodyStart.every((s) => s.includes("loading") === false));
});

test("createSSRDocumentFromTemplate: preserves non-entry body content in bodyStart", () => {
  const doc = createSSRDocumentFromTemplate(TEMPLATE_WITH_CONTENT);
  const bodyStartStr = doc.bodyStart.join("");
  assert.ok(bodyStartStr.includes("nav bar"));
});

test("createSSRDocumentFromTemplate: preserves non-entry body content in bodyEnd", () => {
  const doc = createSSRDocumentFromTemplate(TEMPLATE_WITH_CONTENT);
  const bodyEndStr = doc.bodyEnd.join("");
  assert.ok(bodyEndStr.includes("footer"));
});

test("createSSRDocumentFromTemplate: strips managed head tags from nodes", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const nodesStr = doc.head.nodes.join("");
  assert.ok(!nodesStr.includes("<title>"));
  assert.ok(!nodesStr.includes("<meta"));
  assert.ok(!nodesStr.includes("<link"));
  assert.ok(!nodesStr.includes("<script"));
});

// createHtmlDocumentShell

test("createHtmlDocumentShell: outputs valid HTML shell", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.startsWith("<!doctype html>"));
  assert.ok(shell.beforeEntry.includes("<html"));
  assert.ok(shell.beforeEntry.includes("<head>"));
  assert.ok(shell.beforeEntry.includes("</head>"));
  assert.ok(shell.beforeEntry.includes("<body"));
  assert.ok(shell.beforeEntry.includes("anaemia-entry"));

  assert.ok(shell.afterEntry.includes("</body>"));
  assert.ok(shell.afterEntry.includes("</html>"));
});

test("createHtmlDocumentShell: includes title in head", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.includes("<title>Test App</title>"));
});

test("createHtmlDocumentShell: includes meta tags", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.includes('charset="utf-8"'));
});

test("createHtmlDocumentShell: includes link tags", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.includes('href="/global.css"'));
});

test("createHtmlDocumentShell: includes script tags", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.includes("window.__INIT__ = true;"));
});

test("createHtmlDocumentShell: includes html lang attribute", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.includes('lang="en"'));
});

test("createHtmlDocumentShell: includes body class attribute", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const shell = createHtmlDocumentShell(doc);

  assert.ok(shell.beforeEntry.includes('class="app"'));
});

// applyFrameworkDocumentDefaults

test("applyFrameworkDocumentDefaults: adds dev cache headers in dev mode", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  applyFrameworkDocumentDefaults({
    doc,
    manifest: { routes: [], chunks: {} },
    activeChunk: "index",
    isDev: true,
    hydrationRuntimeScript: "",
    hydrationDataScript: "",
  });

  const meta = doc.head.meta;
  assert.ok(meta.some((m) => m["http-equiv"] === "Cache-Control"));
  assert.ok(meta.some((m) => m["http-equiv"] === "Pragma"));
  assert.ok(meta.some((m) => m["http-equiv"] === "Expires"));
});

test("applyFrameworkDocumentDefaults: no cache headers in production", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  applyFrameworkDocumentDefaults({
    doc,
    manifest: { routes: [], chunks: {} },
    activeChunk: "index",
    isDev: false,
    hydrationRuntimeScript: "",
    hydrationDataScript: "",
  });

  const meta = doc.head.meta;
  assert.ok(!meta.some((m) => m["http-equiv"] === "Cache-Control"));
});

test("applyFrameworkDocumentDefaults: appends hydration scripts", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  applyFrameworkDocumentDefaults({
    doc,
    manifest: { routes: [], chunks: {} },
    activeChunk: "index",
    isDev: false,
    hydrationRuntimeScript: "<script>HYDRATION_RUNTIME</script>",
    hydrationDataScript: '<script id="__DATA__">{"data":true}</script>',
  });

  const nodesStr = doc.head.nodes.join("");
  assert.ok(nodesStr.includes("HYDRATION_RUNTIME"));

  const bodyEndStr = doc.bodyEnd.join("");
  assert.ok(bodyEndStr.includes("__DATA__"));
});

test("applyFrameworkDocumentDefaults: adds route chunk script tags", () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  applyFrameworkDocumentDefaults({
    doc,
    manifest: {
      routes: [],
      chunks: {
        "my-page": { js: ["/assets/my-page.js"], css: ["/assets/my-page.css"] },
      },
    },
    activeChunk: "my-page",
    isDev: false,
    hydrationRuntimeScript: "",
    hydrationDataScript: "",
  });

  const bodyEndStr = doc.bodyEnd.join("");
  assert.ok(bodyEndStr.includes("/assets/my-page.js"));

  const nodesStr = doc.head.nodes.join("");
  assert.ok(nodesStr.includes("/assets/my-page.css"));
});

// applyPluginDocumentHooks

test("applyPluginDocumentHooks: calls configureDocument on each plugin", async () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  let called = false;

  const plugin = {
    name: "test-plugin",
    configureDocument: (d) => {
      d.head.title = "Plugin Title";
      called = true;
    },
  };

  await applyPluginDocumentHooks({ doc, ctx: {}, plugins: [plugin] });
  assert.ok(called);
  assert.equal(doc.head.title, "Plugin Title");
});

test("applyPluginDocumentHooks: injects head content", async () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);

  const plugin = {
    name: "head-plugin",
    injectHead: () => '<meta name="plugin" content="yes">',
  };

  await applyPluginDocumentHooks({ doc, ctx: {}, plugins: [plugin] });
  assert.ok(doc.head.nodes.some((n) => n.includes('name="plugin"')));
});

test("applyPluginDocumentHooks: injects body content", async () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);

  const plugin = {
    name: "body-plugin",
    injectBody: () => "<div>injected</div>",
  };

  await applyPluginDocumentHooks({ doc, ctx: {}, plugins: [plugin] });
  assert.ok(doc.bodyEnd.some((n) => n.includes("injected")));
});

test("applyPluginDocumentHooks: injects body start content", async () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);

  const plugin = {
    name: "body-start-plugin",
    injectBodyStart: () => "<div>at start</div>",
  };

  await applyPluginDocumentHooks({ doc, ctx: {}, plugins: [plugin] });
  assert.ok(doc.bodyStart.some((n) => n.includes("at start")));
});

test("applyPluginDocumentHooks: skips plugins without hooks", async () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);

  const plugin = { name: "no-hooks" };

  await applyPluginDocumentHooks({ doc, ctx: {}, plugins: [plugin] });
  assert.equal(doc.head.nodes.length, 0);
});

test("applyPluginDocumentHooks: processes multiple plugins in order", async () => {
  const doc = createSSRDocumentFromTemplate(BASIC_TEMPLATE);
  const order = [];

  const plugin1 = {
    name: "first",
    configureDocument: () => { order.push("first"); },
  };
  const plugin2 = {
    name: "second",
    configureDocument: () => { order.push("second"); },
  };

  await applyPluginDocumentHooks({ doc, ctx: {}, plugins: [plugin1, plugin2] });
  assert.deepEqual(order, ["first", "second"]);
});
