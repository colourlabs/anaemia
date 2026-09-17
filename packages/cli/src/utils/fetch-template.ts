import * as tar from "tar";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import logger from "./logger.js";
import { TEMPLATE_INTEGRITY } from "../generated/template-manifest.js";

const {
  default: { version },
} = await import("../../package.json", { with: { type: "json" } });

const TAR_URL = `https://codeload.github.com/colourlabs/anaemia/tar.gz/refs/tags/v${version}`;
const TEMPLATE_PREFIX = `anaemia-${version}/templates/base-app/`;

// only regular files and directories may be extracted. symlinks/hardlinks and
// device/fifo entries are rejected so a hostile archive cannot escape the
// staging directory through a link target.
const ALLOWED_ENTRY_TYPES = new Set(["File", "OldFile", "ContiguousFile", "Directory"]);

/**
 * validate a single archive entry before it is extracted. `p` is the path as it
 * appears in the archive (tar runs `filter` before applying `strip`, so this is
 * the full `anaemia-<version>/templates/base-app/...` path).
 */
function isSafeTemplateEntry(p: string, entry: { type?: string }): boolean {
  const normalized = p.replaceAll("\\", "/");
  if (!normalized.startsWith(TEMPLATE_PREFIX)) return false;

  const relative = normalized.slice(TEMPLATE_PREFIX.length);
  if (relative.length === 0) return false;

  const segments = relative.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  if (path.isAbsolute(relative)) return false;

  return entry.type !== undefined && ALLOWED_ENTRY_TYPES.has(entry.type);
}

async function extractInto(staging: string, body: ReadableStream<Uint8Array>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract({
      cwd: staging,
      strip: 3,
      filter: (p, entry) => isSafeTemplateEntry(p, "type" in entry ? entry : {}),
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    const reader = body.getReader();

    const pump = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          extract.end();
          break;
        }
        extract.write(value);
      }
    };

    pump().catch(reject);
  });
}

function hashFile(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * compare every extracted file against the committed content digests. the
 * extracted set must match the manifest exactly: missing, extra, symlinked or
 * mismatched files all abort before anything is written to the target.
 */
function verifyExtracted(root: string, expected: Record<string, string>): void {
  const actual = new Map<string, string>();
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`template archive contains a symlink: ${full}`);
      }
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`template archive contains an unsupported entry: ${full}`);
      }
      const relative = path.relative(root, full).split(path.sep).join("/");
      actual.set(relative, hashFile(full));
    }
  }

  for (const [relative, digest] of Object.entries(expected)) {
    const found = actual.get(relative);
    if (found === undefined) throw new Error(`template archive is missing a file: ${relative}`);
    if (found !== digest) throw new Error(`template integrity check failed for: ${relative}`);
  }

  for (const relative of actual.keys()) {
    if (!Object.hasOwn(expected, relative)) {
      throw new Error(`template archive contains an unexpected file: ${relative}`);
    }
  }
}

export async function fetchTemplate(targetPath: string): Promise<void> {
  if (TEMPLATE_INTEGRITY.version !== version) {
    throw new Error(
      `template integrity manifest is for v${TEMPLATE_INTEGRITY.version} but this cli is v${version}; ` +
        `refusing to install an unverified template.`,
    );
  }

  logger.info(`downloading template for v${version}...`);

  const res = await fetch(TAR_URL);
  if (!res.ok || !res.body) throw new Error(`failed to download template: ${res.statusText}`);

  // extract into an isolated staging dir first; the target is only touched
  // after the whole tree has been verified against the committed digests.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "anaemia-template-"));
  try {
    await extractInto(staging, res.body);
    verifyExtracted(staging, TEMPLATE_INTEGRITY.files);
    fs.cpSync(staging, targetPath, { recursive: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
