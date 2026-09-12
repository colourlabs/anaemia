import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";

export const DEFAULT_MAX_RPC_BODY_BYTES = 512_000;
export const DEFAULT_RPC_TOKEN_TTL_SECONDS = 3_600;

export type RpcSecurityOptions = {
  /**
   * additional origins (beyond the request's own origin) allowed to call /_rpc.
   * defaults to the server's own origin only.
   */
  allowedOrigins?: (string | URL)[];
  /**
   * maximum accepted /_rpc request body size in bytes, enforced while the body
   * is streamed so chunked-encoding cannot bypass it. defaults to 512000.
   */
  maxBodyBytes?: number;
};

/**
 * HMAC secret used to sign & verify per-render RPC tokens.
 * Prefer setting ANAEMIA_RPC_SECRET via the environment. When it is missing,
 * an ephemeral per-process secret is generated so the framework stays secure
 * by default (tokens simply do not survive a restart).
 */
let rpcSecret = process.env.ANAEMIA_RPC_SECRET;

function secret(): string {
  if (!rpcSecret) {
    rpcSecret = randomBytes(32).toString("hex");
    console.warn(
      "[anaemia] ANAEMIA_RPC_SECRET is not set; /_rpc tokens are being signed " +
        "with an ephemeral per-process secret. Set ANAEMIA_RPC_SECRET in production " +
        "so tokens survive restarts.",
    );
  }
  return rpcSecret;
}

/** override the signing secret (tests / bootstrap). */
export function setRpcSecret(value: string): void {
  rpcSecret = value;
}

type RpcTokenPayload = {
  exp: number;
  nonce: string;
};

function sign(body: Buffer): Buffer {
  return createHmac("sha256", secret()).update(body).digest();
}

/**
 * Mint a token to embed into the hydration payload of a rendered page.
 * Valid for `ttlSeconds` and verified with a timing-safe HMAC comparison.
 */
export function createRpcToken(options: { ttlSeconds?: number } = {}): string {
  const payload: RpcTokenPayload = {
    exp: Math.floor(Date.now() / 1000) + (options.ttlSeconds ?? DEFAULT_RPC_TOKEN_TTL_SECONDS),
    nonce: randomBytes(16).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(Buffer.from(body)).toString("base64url")}`;
}

export function verifyRpcToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = sign(Buffer.from(body));
    actual = Buffer.from(sig, "base64url");
  } catch {
    return false;
  }

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as RpcTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Rejects cross-origin / cross-site browser requests. Bare scripts (no Origin
 * header) are not blocked here - the HMAC token is the real gate for those.
 */
export function verifyOrigin(c: Context, extraOrigins: (string | URL)[] = []): boolean {
  const originHeader = c.req.header("origin") ?? c.req.header("referer");
  if (originHeader) {
    const origin = originOf(originHeader);
    if (!origin) return false;
    const self = originOf(c.req.url);
    if (!self) return false;
    const allowed = new Set<string>([self]);
    for (const extra of extraOrigins) {
      const parsed = originOf(String(extra));
      if (parsed) allowed.add(parsed);
    }
    if (!allowed.has(origin)) return false;
  }

  const secFetchSite = c.req.header("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") return false;

  return true;
}

function readStream(req: Request): ReadableStream<Uint8Array> {
  if (req.body) return req.body;
  // an empty body still yields a consumable stream per the fetch spec
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

/**
 * Read the raw request body into a string, aborting as soon as `limit` bytes
 * are exceeded. Unlike a content-length check this cannot be bypassed with
 * `Transfer-Encoding: chunked` or a forged length header.
 */
export async function readBodyWithLimit(req: Request, limit: number): Promise<string> {
  const reader = readStream(req).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError(`body exceeds ${limit} bytes`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}
