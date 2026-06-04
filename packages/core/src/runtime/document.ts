import { createContext, createRenderEffect, useContext, type JSX } from "solid-js";
import { isServer } from "solid-js/web";
import type { SSRDocument } from "../config.js";

const serverDocumentRegistry = new Map<symbol, SSRDocument>();
let currentRenderKey: symbol | undefined;

export function setCurrentSSRDocument(doc: SSRDocument): symbol {
  const key = Symbol("ssr-render");
  serverDocumentRegistry.set(key, doc);
  currentRenderKey = key;
  return key;
}

export function releaseSSRDocument(key: symbol): void {
  serverDocumentRegistry.delete(key);
  if (currentRenderKey === key) currentRenderKey = undefined;
}

// client-side context
const DocumentContext = createContext<SSRDocument>();

export function SSRDocumentProvider(props: { document: SSRDocument; children: JSX.Element }): JSX.Element {
  return DocumentContext.Provider({
    value: props.document,
    get children() {
      return props.children;
    },
  });
}

export function useSSRDocument(): SSRDocument | undefined {
  if (isServer) {
    // try context first (works in tests and when SolidJS context is available)
    const fromContext = useContext(DocumentContext);
    if (fromContext) return fromContext;
    // fall back to registry (for production SSR where renderToStream breaks async context)
    if (currentRenderKey) return serverDocumentRegistry.get(currentRenderKey);
    return undefined;
  }
  return useContext(DocumentContext);
}

type MetaEntry = { name?: string; property?: string; content: string };

type OverwriteHeadProps = {
  pageTitle?: string;
  description?: string;
  image?: string;
  canonical?: string;
  robots?: string;
  og?:
    | boolean
    | {
        title?: string;
        description?: string;
        image?: string;
        type?: string;
        siteName?: string;
        url?: string;
        locale?: string;
      };
  twitter?:
    | boolean
    | {
        title?: string;
        description?: string;
        image?: string;
        card?: "summary" | "summary_large_image" | "app" | "player";
        site?: string;
        creator?: string;
      };
  meta?: MetaEntry[];
  links?: Array<{ rel: string; href: string; [key: string]: string }>;
};

function resolveHeadMeta(props: OverwriteHeadProps): MetaEntry[] {
  const entries: MetaEntry[] = [];
  const og = props.og === true ? {} : props.og === false ? undefined : props.og;
  const twitter = props.twitter === true ? {} : props.twitter === false ? undefined : props.twitter;

  if (props.description) {
    entries.push({ name: "description", content: props.description });
  }

  if (og !== undefined) {
    const ogTitle = og.title ?? props.pageTitle;
    const ogDescription = og.description ?? props.description;
    const ogImage = og.image ?? props.image;

    if (ogTitle) entries.push({ property: "og:title", content: ogTitle });
    if (ogDescription) entries.push({ property: "og:description", content: ogDescription });
    if (ogImage) entries.push({ property: "og:image", content: ogImage });
    if (og.type) entries.push({ property: "og:type", content: og.type });
    if (og.siteName) entries.push({ property: "og:site_name", content: og.siteName });
    if (og.url) entries.push({ property: "og:url", content: og.url });
    if (og.locale) entries.push({ property: "og:locale", content: og.locale });
  }

  if (twitter !== undefined) {
    const twitterTitle = twitter.title ?? props.pageTitle;
    const twitterDescription = twitter.description ?? props.description;
    const twitterImage = twitter.image ?? props.image;

    if (twitterTitle) entries.push({ name: "twitter:title", content: twitterTitle });
    if (twitterDescription) entries.push({ name: "twitter:description", content: twitterDescription });
    if (twitterImage) entries.push({ name: "twitter:image", content: twitterImage });
    if (twitter.card) entries.push({ name: "twitter:card", content: twitter.card });
    if (twitter.site) entries.push({ name: "twitter:site", content: twitter.site });
    if (twitter.creator) entries.push({ name: "twitter:creator", content: twitter.creator });
  }

  if (props.robots) entries.push({ name: "robots", content: props.robots });
  if (props.meta) entries.push(...props.meta);

  return entries;
}

function applyMetaToDoc(doc: SSRDocument, props: OverwriteHeadProps, entries: MetaEntry[]): void {
  for (const entry of entries) {
    const key = entry.name ? "name" : "property";
    const val = entry.name ?? entry.property;
    if (!val) continue;
    const existing = doc.head.meta.find((m) => m[key] === val);
    if (existing) existing.content = entry.content;
    else doc.head.meta.push({ [key]: val, content: entry.content });
  }

  if (props.canonical) {
    const existing = doc.head.links.find((l) => l.rel === "canonical");
    if (existing) existing.href = props.canonical;
    else doc.head.links.push({ rel: "canonical", href: props.canonical });
  }

  for (const link of props.links ?? []) {
    const existing = doc.head.links.find((l) => l.rel === link.rel && l.href === link.href);
    if (!existing) doc.head.links.push(link);
  }
}

function applyMetaToDom(props: OverwriteHeadProps, entries: MetaEntry[]): void {
  for (const entry of entries) {
    const key = entry.name ? "name" : "property";
    const val = entry.name ?? entry.property;
    if (!val) continue;
    const tag = document.querySelector(`meta[${key}="${val}"]`);
    if (tag) {
      tag.setAttribute("content", entry.content);
    } else {
      const meta = document.createElement("meta");
      if (entry.name) meta.setAttribute("name", entry.name);
      if (entry.property) meta.setAttribute("property", entry.property);
      meta.setAttribute("content", entry.content);
      document.head.appendChild(meta);
    }
  }

  if (props.canonical) {
    const existing = document.querySelector(`link[rel="canonical"]`);
    if (existing) existing.setAttribute("href", props.canonical);
    else {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", props.canonical);
      document.head.appendChild(link);
    }
  }

  for (const linkAttrs of props.links ?? []) {
    if (document.querySelector(`link[rel="${linkAttrs.rel}"][href="${linkAttrs.href}"]`)) continue;
    const link = document.createElement("link");
    for (const [k, v] of Object.entries(linkAttrs)) link.setAttribute(k, v);
    document.head.appendChild(link);
  }
}

export function OverwriteHead(props: OverwriteHeadProps): null {
  if (isServer) {
    const doc = useSSRDocument();
    if (doc) {
      if (props.pageTitle !== undefined) doc.head.title = props.pageTitle;
      applyMetaToDoc(doc, props, resolveHeadMeta(props));
    }
  } else {
    createRenderEffect(() => {
      if (props.pageTitle !== undefined) document.title = props.pageTitle;
      applyMetaToDom(props, resolveHeadMeta(props));
    });
  }

  return null;
}
