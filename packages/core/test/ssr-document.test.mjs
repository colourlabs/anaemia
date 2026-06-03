import assert from "node:assert/strict";
import test from "node:test";
import { createComponent } from "solid-js/web";
import { renderToStream } from "solid-js/web";
import {
  applyFrameworkDocumentDefaults,
  applyPluginDocumentHooks,
  createHtmlDocumentShell,
  createSSRDocumentFromTemplate,
} from "../dist/runtime/server/html.js";
import { OverwriteHead, SSRDocumentProvider } from "../dist/runtime/document.js";

test("SSR document is built from template and configurable by plugins", async () => {
  const doc = createSSRDocumentFromTemplate(
    `<!doctype html><html lang="en"><head><title>Base</title><meta name="viewport" content="width=device-width"></head><body class="app"><main anaemia-entry></main></body></html>`,
  );

  applyFrameworkDocumentDefaults({
    doc,
    manifest: { routes: [], chunks: { client: { js: ["client.js"], css: ["client.css"] } }, errors: {} },
    activeChunk: "client",
    isDev: true,
    hydrationRuntimeScript: "<script>hydrate()</script>",
    hydrationDataScript: "<script>data()</script>",
  });

  await applyPluginDocumentHooks({
    doc,
    plugins: [
      {
        name: "locale",
        configureDocument(document) {
          document.htmlAttrs.lang = "cy";
          document.head.title = "Plugin";
        },
        injectBodyStart: () => "<script>theme()</script>",
        injectBody: () => "<script>legacy()</script>",
      },
    ],
    ctx: {
      request: new Request("https://example.test/"),
      url: new URL("https://example.test/"),
      pathname: "/",
      params: {},
      routePattern: "/",
      isDev: true,
    },
  });

  renderToStream(() =>
    createComponent(SSRDocumentProvider, {
      document: doc,
      get children() {
        return createComponent(OverwriteHead, {
          get children() {
            return `<title>Page</title><meta name="description" content="hello">`;
          },
        });
      },
    }),
  );

  const shell = createHtmlDocumentShell(doc);
  const html = `${shell.beforeEntry}APP${shell.afterEntry}`;

  assert.match(html, /<html lang="cy">/);
  assert.match(html, /<title>Page<\/title>/);
  assert.match(html, /<meta name="viewport" content="width=device-width">/);
  assert.match(html, /<meta name="description" content="hello">/);
  assert.match(html, /<link rel="stylesheet" href="\/client.css">/);
  assert.match(html, /<script>theme\(\)<\/script><main anaemia-entry>APP<\/main>/);
  assert.match(html, /<script>data\(\)<\/script><script type="module" src="\/client.js"><\/script>/);
  assert.match(html, /<script>legacy\(\)<\/script>/);
});
