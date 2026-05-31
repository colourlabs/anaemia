import { ENTRY_ATTRIBUTE } from "../shared/constants.js";
import type { ChunkAssets, RouteManifest } from "./types.js";

const ENTRY_TAG_REGEX = /(<([a-zA-Z0-9-]+)[^>]*anaemia-entry[^>]*>)(.*?)(<\/\2>)/is;

function normalizeAssetUrl(url: unknown): string {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

function chunkAssetTags(chunk: ChunkAssets | undefined): { scripts: string; styles: string } {
  if (!chunk) return { scripts: "", styles: "" };

  const scripts =
    (chunk.js ?? "")
      ? (Array.isArray(chunk.js) ? chunk.js : [chunk.js])
          .map((jsFile) => `<script type="module" src="${normalizeAssetUrl(jsFile)}"></script>\n`)
          .join("")
      : "";

  const styles =
    (chunk.css ?? "")
      ? (Array.isArray(chunk.css) ? chunk.css : [chunk.css])
          .map((cssFile) => `<link rel="stylesheet" href="${normalizeAssetUrl(cssFile)}">\n`)
          .join("")
      : "";

  return { scripts, styles };
}

export function getRouteAssetTags(manifest: RouteManifest, activeChunk: string): { scripts: string; styles: string } {
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

export function createDevNoCacheHeadTags(isDev: boolean): string {
  return isDev
    ? `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">\n`
    : "";
}

export function createHtmlStreamShell(args: { template: string; headInjections: string; bodyInjections: string }): {
  beforeEntry: string;
  afterEntry: string;
} {
  const templateWithHead = args.template.replace("<head>", `<head>${args.headInjections}`);
  const entryMatch = ENTRY_TAG_REGEX.exec(templateWithHead);

  if (entryMatch) {
    const [fullMatch, openTag, _tagName, _inner, closeTag] = entryMatch;
    const beforeEntry = `${templateWithHead.slice(0, entryMatch.index)}${openTag}`;
    const afterEntry = `${closeTag}${templateWithHead.slice(entryMatch.index + fullMatch.length)}`.replace(
      "</body>",
      `${args.bodyInjections}</body>`,
    );

    return { beforeEntry, afterEntry };
  }

  const bodyCloseIndex = templateWithHead.lastIndexOf("</body>");
  if (bodyCloseIndex >= 0) {
    return {
      beforeEntry: `${templateWithHead.slice(0, bodyCloseIndex)}<div ${ENTRY_ATTRIBUTE}>`,
      afterEntry: `</div>${args.bodyInjections}${templateWithHead.slice(bodyCloseIndex)}`,
    };
  }

  return {
    beforeEntry: `${templateWithHead}<div ${ENTRY_ATTRIBUTE}>`,
    afterEntry: `</div>${args.bodyInjections}`,
  };
}
