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

const BASE_TEMPLATE = `<!doctype html><html lang="en"><head><title>Base</title><meta name="viewport" content="width=device-width"></head><body class="app"><main anaemia-entry></main></body></html>`;

function createTestDoc() {
  const doc = createSSRDocumentFromTemplate(BASE_TEMPLATE);
  applyFrameworkDocumentDefaults({
    doc,
    manifest: { routes: [], chunks: { client: { js: ["client.js"], css: ["client.css"] } }, errors: {} },
    activeChunk: "client",
    isDev: true,
    hydrationRuntimeScript: "<script>hydrate()</script>",
    hydrationDataScript: "<script>data()</script>",
  });
  return doc;
}

function renderWithHead(doc, headProps) {
  renderToStream(() =>
    createComponent(SSRDocumentProvider, {
      document: doc,
      get children() {
        return createComponent(OverwriteHead, headProps);
      },
    }),
  );
  const shell = createHtmlDocumentShell(doc);
  return `${shell.beforeEntry}APP${shell.afterEntry}`;
}

test("plugin and framework defaults are applied", async () => {
  const doc = createTestDoc();

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

  const html = renderWithHead(doc, { pageTitle: "Page", description: "hello" });

  assert.match(html, /<html lang="cy">/);
  assert.match(html, /<title>Page<\/title>/);
  assert.match(html, /<meta name="viewport" content="width=device-width">/);
  assert.match(html, /<meta name="description" content="hello">/);
  assert.match(html, /<link rel="stylesheet" href="\/client.css">/);
  assert.match(html, /<script>theme\(\)<\/script><main anaemia-entry>APP<\/main>/);
  assert.match(html, /<script>data\(\)<\/script><script type="module" src="\/client.js"><\/script>/);
  assert.match(html, /<script>legacy\(\)<\/script>/);
});

test("pageTitle sets document title", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, { pageTitle: "My Page" });
  assert.match(html, /<title>My Page<\/title>/);
});

test("description sets meta description only when og/twitter not passed", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, { description: "Hello world" });
  assert.match(html, /<meta name="description" content="Hello world">/);
  assert.doesNotMatch(html, /og:description/);
  assert.doesNotMatch(html, /twitter:description/);
});

test("og=true expands pageTitle and description to og tags", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, { pageTitle: "My Page", description: "Hello", og: true });
  assert.match(html, /<meta property="og:title" content="My Page">/);
  assert.match(html, /<meta property="og:description" content="Hello">/);
});

test("og object overrides fallback values", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, {
    pageTitle: "My Page",
    description: "Hello",
    og: { title: "OG Title", description: "OG Description", siteName: "My Site" },
  });
  assert.match(html, /<meta property="og:title" content="OG Title">/);
  assert.match(html, /<meta property="og:description" content="OG Description">/);
  assert.match(html, /<meta property="og:site_name" content="My Site">/);
  assert.doesNotMatch(html, /content="My Page"/); // pageTitle not leaked into og:title
});

test("twitter=true expands to twitter tags", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, {
    pageTitle: "My Page",
    twitter: { card: "summary_large_image" },
  });
  assert.match(html, /<meta name="twitter:title" content="My Page">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});

test("canonical sets link tag", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, { canonical: "https://example.com/page" });
  assert.match(html, /<link rel="canonical" href="https:\/\/example.com\/page">/);
});

test("robots sets meta robots", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, { robots: "noindex, nofollow" });
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test("meta escape hatch passes through arbitrary tags", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, {
    meta: [{ name: "theme-color", content: "#ffffff" }],
  });
  assert.match(html, /<meta name="theme-color" content="#ffffff">/);
});

test("image populates og:image and twitter:image when og and twitter enabled", () => {
  const doc = createTestDoc();
  const html = renderWithHead(doc, {
    image: "https://example.com/og.jpg",
    og: true,
    twitter: true,
  });
  assert.match(html, /<meta property="og:image" content="https:\/\/example.com\/og.jpg">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/example.com\/og.jpg">/);
});
