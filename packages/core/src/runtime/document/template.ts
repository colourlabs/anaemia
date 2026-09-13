import { ENTRY_ATTRIBUTE } from "../constants.js";
import type { ChunkAssets, ChunkCssAsset, RouteManifest } from "../server/types.js";
import type { AnaemiaPlugin } from "../../config.js";
import type { SSRDocument, SSRDocumentAttributes, SSRDocumentContext, SSRDocumentHead } from "./types.js";

const ENTRY_TAG_REGEX = /(<([a-zA-Z0-9-]+)[^>]*anaemia-entry[^>]*>)(.*?)(<\/\2>)/is;
const HTML_OPEN_REGEX = /<html\b([^>]*)>/i;
const BODY_OPEN_REGEX = /<body\b([^>]*)>/i;
const HEAD_BLOCK_REGEX = /<head\b[^>]*>(.*?)<\/head>/is;
const BODY_BLOCK_REGEX = /<body\b[^>]*>(.*?)<\/body>/is;
const TITLE_REGEX = /<title\b[^>]*>(.*?)<\/title>/is;
const META_TAG_REGEX = /<meta\b([^>]*)>/gis;
const LINK_TAG_REGEX = /<link\b([^>]*)>/gis;
const SCRIPT_TAG_REGEX = /<script\b([^>]*)>(.*?)<\/script>/gis;

type SSRDocumentInternals = {
  entryOpen: string;
  entryClose: string;
};

const documentInternals = new WeakMap<SSRDocument, SSRDocumentInternals>();

type DocumentSource = {
  htmlAttrs: SSRDocumentAttributes;
  head: SSRDocumentHead;
  bodyAttrs: SSRDocumentAttributes;
  bodyStart: string[];
  bodyEnd: string[];
  internals: SSRDocumentInternals;
};

// the parsed template is immutable and identical for every render, so it is
// parsed once and each request gets a shallow clone (fresh arrays) that the
// framework and plugins can safely mutate.
const documentSourceCache: { template: string; source: DocumentSource } = {
  template: "",
  source: {
    htmlAttrs: {},
    head: { title: undefined, meta: [], links: [], scripts: [], nodes: [] },
    bodyAttrs: {},
    bodyStart: [],
    bodyEnd: [],
    internals: { entryOpen: "", entryClose: "" },
  },
};

function getDocumentSource(template: string): DocumentSource {
  if (documentSourceCache.template !== template) {
    const head = HEAD_BLOCK_REGEX.exec(template)?.[1] ?? "";
    const rawHeadNodes = stripManagedHeadTags(head);
    const bodySlots = extractEntryBodySlots(template);
    documentSourceCache.template = template;
    documentSourceCache.source = {
      htmlAttrs: parseAttributes(HTML_OPEN_REGEX.exec(template)?.[1]),
      head: {
        title: TITLE_REGEX.exec(head)?.[1]?.trim(),
        meta: [...head.matchAll(META_TAG_REGEX)].map((match) => parseAttributes(match[1])),
        links: [...head.matchAll(LINK_TAG_REGEX)].map((match) => parseAttributes(match[1])),
        scripts: [...head.matchAll(SCRIPT_TAG_REGEX)].map((match) => ({
          ...parseAttributes(match[1]),
          children: match[2],
        })),
        nodes: rawHeadNodes ? [rawHeadNodes] : [],
      },
      bodyAttrs: parseAttributes(BODY_OPEN_REGEX.exec(template)?.[1]),
      bodyStart: bodySlots.beforeEntry,
      bodyEnd: bodySlots.afterEntry,
      internals: { entryOpen: bodySlots.entryOpen, entryClose: bodySlots.entryClose },
    };
  }
  return documentSourceCache.source;
}

function normalizeAssetUrl(url: unknown): string {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeText(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

function serializeAttributes(attrs: SSRDocumentAttributes): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => (value === true ? key : `${key}="${escapeHtml(value)}"`))
    .join(" ");
}

function serializeTag(name: string, attrs: SSRDocumentAttributes, children?: string): string {
  const serializedAttrs = serializeAttributes(attrs);
  const open = serializedAttrs ? `<${name} ${serializedAttrs}>` : `<${name}>`;
  if (children === undefined) return open;
  return `${open}${children}</${name}>`;
}

function stripManagedHeadTags(head: string): string {
  return head
    .replace(TITLE_REGEX, "")
    .replace(META_TAG_REGEX, "")
    .replace(LINK_TAG_REGEX, "")
    .replace(SCRIPT_TAG_REGEX, "")
    .trim();
}

function extractEntryBodySlots(template: string): {
  beforeEntry: string[];
  entryOpen: string;
  entryClose: string;
  afterEntry: string[];
} {
  const body = BODY_BLOCK_REGEX.exec(template)?.[1] ?? template;
  const entryMatch = ENTRY_TAG_REGEX.exec(body);

  if (entryMatch) {
    const [fullMatch, openTag, _tagName, _inner, closeTag] = entryMatch;
    return {
      beforeEntry: [body.slice(0, entryMatch.index)].filter(Boolean),
      entryOpen: openTag,
      entryClose: closeTag,
      afterEntry: [body.slice(entryMatch.index + fullMatch.length)].filter(Boolean),
    };
  }

  return {
    beforeEntry: [body].filter(Boolean),
    entryOpen: `<div ${ENTRY_ATTRIBUTE}>`,
    entryClose: "</div>",
    afterEntry: [],
  };
}

function normalizeCssAsset(cssFile: string | ChunkCssAsset): ChunkCssAsset {
  return typeof cssFile === "string" ? { href: cssFile } : cssFile;
}

function cssAssetTag(cssFile: string | ChunkCssAsset): string {
  const asset = normalizeCssAsset(cssFile);
  const href = normalizeAssetUrl(asset.href);
  const media = asset.media ? ` media="${escapeHtml(asset.media)}"` : "";

  if (asset.critical && asset.content) {
    return `<style data-anaemia-critical-css="${escapeHtml(href)}">${asset.content}</style>\n`;
  }

  if (asset.defer) {
    return `<link rel="preload" href="${href}" as="style"${media} onload="this.onload=null;this.rel='stylesheet'">\n<noscript><link rel="stylesheet" href="${href}"${media}></noscript>\n`;
  }

  return `<link rel="stylesheet" href="${href}"${media}>\n`;
}

function chunkAssetTags(chunk: ChunkAssets | undefined): { scripts: string; styles: string } {
  if (!chunk) return { scripts: "", styles: "" };
  const jsFiles = chunk.js ?? [];
  const cssFiles = chunk.css ?? [];

  const scripts =
    jsFiles.length > 0
      ? jsFiles.map((jsFile) => `<script type="module" src="${normalizeAssetUrl(jsFile)}"></script>\n`).join("")
      : "";

  const styles = cssFiles.length > 0 ? cssFiles.map((cssFile) => cssAssetTag(cssFile)).join("") : "";

  return { scripts, styles };
}

function getRouteAssetTags(manifest: RouteManifest, activeChunk: string): { scripts: string; styles: string } {
  const chunkNames = ["client", "framework", "commons", "vendors"];
  if (activeChunk && activeChunk !== "client") chunkNames.push(activeChunk);

  return chunkNames.reduce(
    (assetTags, chunkName) => {
      const tags = chunkAssetTags(manifest.chunks[chunkName]);
      return {
        scripts: assetTags.scripts + tags.scripts,
        styles: assetTags.styles + tags.styles,
      };
    },
    { scripts: "", styles: "" },
  );
}

export function createSSRDocumentFromTemplate(template: string): SSRDocument {
  const src = getDocumentSource(template);
  const doc: SSRDocument = {
    htmlAttrs: { ...src.htmlAttrs },
    head: {
      title: src.head.title,
      meta: src.head.meta.map((attrs) => ({ ...attrs })),
      links: src.head.links.map((attrs) => ({ ...attrs })),
      scripts: src.head.scripts.map((attrs) => ({ ...attrs })),
      nodes: [...src.head.nodes],
    },
    bodyAttrs: { ...src.bodyAttrs },
    bodyStart: [...src.bodyStart],
    bodyEnd: [...src.bodyEnd],
  };

  documentInternals.set(doc, src.internals);

  return doc;
}

export async function applyPluginDocumentHooks(args: {
  doc: SSRDocument;
  ctx: SSRDocumentContext;
  plugins: AnaemiaPlugin[];
}): Promise<void> {
  for (const plugin of args.plugins) {
    await plugin.configureDocument?.(args.doc, args.ctx);

    const [head, bodyStart, bodyEnd] = await Promise.all([
      plugin.injectHead?.(),
      plugin.injectBodyStart?.(),
      plugin.injectBody?.(),
    ]);

    if (head) args.doc.head.nodes.push(head);
    if (bodyStart) args.doc.bodyStart.push(bodyStart);
    if (bodyEnd) args.doc.bodyEnd.push(bodyEnd);
  }
}

export function applyFrameworkDocumentDefaults(args: {
  doc: SSRDocument;
  manifest: RouteManifest;
  activeChunk: string;
  isDev: boolean;
  hydrationRuntimeScript: string;
  hydrationDataScript: string;
}): void {
  const routeAssetTags = getRouteAssetTags(args.manifest, args.activeChunk);

  if (args.isDev) {
    args.doc.head.meta.push(
      { "http-equiv": "Cache-Control", content: "no-cache, no-store, must-revalidate" },
      { "http-equiv": "Pragma", content: "no-cache" },
      { "http-equiv": "Expires", content: "0" },
    );
  }

  args.doc.head.nodes.push(routeAssetTags.styles, args.hydrationRuntimeScript);
  args.doc.bodyEnd.push(args.hydrationDataScript, routeAssetTags.scripts);
}

function serializeHead(doc: SSRDocument): string {
  return [
    doc.head.title ? `<title>${escapeText(doc.head.title)}</title>` : "",
    ...doc.head.meta.map((attrs) => `${serializeTag("meta", attrs)}\n`),
    ...doc.head.links.map((attrs) => `${serializeTag("link", attrs)}\n`),
    ...doc.head.scripts.map(({ children, ...attrs }) => `${serializeTag("script", attrs, children ?? "")}\n`),
    ...doc.head.nodes,
  ].join("");
}

export function createHtmlDocumentShell(doc: SSRDocument): {
  beforeEntry: string;
  afterEntry: string;
} {
  const htmlAttrs = serializeAttributes(doc.htmlAttrs);
  const bodyAttrs = serializeAttributes(doc.bodyAttrs);
  const internals = documentInternals.get(doc) ?? {
    entryOpen: `<div ${ENTRY_ATTRIBUTE}>`,
    entryClose: "</div>",
  };

  return {
    beforeEntry: [
      "<!doctype html>",
      htmlAttrs ? `<html ${htmlAttrs}>` : "<html>",
      "<head>",
      serializeHead(doc),
      "</head>",
      bodyAttrs ? `<body ${bodyAttrs}>` : "<body>",
      ...doc.bodyStart,
      internals.entryOpen,
    ].join(""),
    afterEntry: [internals.entryClose, ...doc.bodyEnd, "</body></html>"].join(""),
  };
}
