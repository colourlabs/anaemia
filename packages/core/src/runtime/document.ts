import { createContext, createRenderEffect, useContext, type JSX } from "solid-js";
import { isServer } from "solid-js/web";
import type { SSRDocument, SSRDocumentAttributes } from "../config.js";

const DocumentContext = createContext<SSRDocument>();

function parseAttributes(source: string | undefined): SSRDocumentAttributes {
  const attrs: SSRDocumentAttributes = {};
  if (!source) return attrs;

  const attrRegex = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(source))) {
    const name = match.at(1);
    if (!name) continue;
    attrs[name] = match.at(2) ?? match.at(3) ?? match.at(4) ?? true;
  }
  return attrs;
}

function applyHeadHtml(doc: SSRDocument, html: string): void {
  const title = /<title\b[^>]*>(.*?)<\/title>/is.exec(html)?.[1];
  if (title !== undefined) doc.head.title = title;

  for (const match of html.matchAll(/<meta\b([^>]*)>/gis)) {
    doc.head.meta.push(parseAttributes(match[1]));
  }

  for (const match of html.matchAll(/<link\b([^>]*)>/gis)) {
    doc.head.links.push(parseAttributes(match[1]));
  }

  for (const match of html.matchAll(/<script\b([^>]*)>(.*?)<\/script>/gis)) {
    doc.head.scripts.push({ ...parseAttributes(match[1]), children: match[2] });
  }
}

function applyClientHead(html: string): void {
  if (typeof document === "undefined") return;

  const title = /<title\b[^>]*>(.*?)<\/title>/is.exec(html)?.[1];
  if (title !== undefined) document.title = title;
}

export function SSRDocumentProvider(props: { document: SSRDocument; children: JSX.Element }): JSX.Element {
  return DocumentContext.Provider({
    value: props.document,
    get children() {
      return props.children;
    },
  });
}

export function useSSRDocument(): SSRDocument | undefined {
  return useContext(DocumentContext);
}

export function OverwriteHead(props: { children: JSX.Element }): null {
  const doc = useSSRDocument();
  const html = () => String(props.children ?? "");

  if (isServer && doc) {
    applyHeadHtml(doc, html());
  } else {
    createRenderEffect(() => applyClientHead(html()));
  }

  return null;
}
