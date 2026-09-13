import type { Hono } from "hono";
import { serverFunctionsRegistry, serverFunctionPolicies } from "../../context.js";
import { RPC_PATH } from "../../constants.js";
import {
  DEFAULT_MAX_RPC_BODY_BYTES,
  PayloadTooLargeError,
  readBodyWithLimit,
  verifyOrigin,
  verifyRpcToken,
  type RpcSecurityOptions,
} from "./security.js";
import { getLogger } from "../logger.js";

export function registerRpcRoute(app: Hono, options: RpcSecurityOptions = {}, isDev = false) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_RPC_BODY_BYTES;
  const allowedOrigins = options.allowedOrigins ?? [];

  app.post(RPC_PATH, async (c) => {
    const functionId = c.req.query("id");
    if (!functionId) {
      return c.json({ error: "RPC function not found" }, 404);
    }

    // reject oversized bodies before any JSON parsing. unlike a content-length
    // check this is enforced while streaming, so chunked-encoding cannot evade it.
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > maxBodyBytes) {
      return c.json({ error: "Payload too large" }, 413);
    }

    let argumentsArray: unknown[];
    try {
      const text = await readBodyWithLimit(c.req.raw, maxBodyBytes);
      const body: unknown = JSON.parse(text || "[]");
      if (!Array.isArray(body)) throw new Error("Expected array");
      argumentsArray = body;
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return c.json({ error: "Payload too large" }, 413);
      }
      return c.json({ error: "Invalid request body" }, 400);
    }

    if (!serverFunctionsRegistry.has(functionId)) {
      return c.json({ error: "RPC function not found" }, 404);
    }

    // every call must present the per-render token embedded in the page that
    // issued it. cross-origin pages cannot read it, blocking CSRF / drive-by
    // execution; bare scripts without a token are also rejected.
    const token = c.req.header("x-anaemia-token");
    if (!token || !verifyRpcToken(token)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // secondary defense-in-depth: reject cross-origin / cross-site browsers.
    if (!verifyOrigin(c, allowedOrigins)) {
      return c.json({ error: "origin not allowed" }, 403);
    }

    // optional per-function authorization policy registered by the application.
    const policy = serverFunctionPolicies.get(functionId);
    if (policy) {
      let authorized: boolean;
      try {
        authorized = await policy.allow({ request: c.req.raw, url: new URL(c.req.url) });
      } catch {
        authorized = false;
      }
      if (!authorized) {
        return c.json({ error: "forbidden" }, 403);
      }
    }

    try {
      const result = await serverFunctionsRegistry.get(functionId)!(...argumentsArray);
      return c.json(result);
    } catch (error) {
      getLogger().error("rpc execution failed", error);
      const message = isDev && error instanceof Error ? error.message : "Internal server error";
      return c.json({ error: message }, 500);
    }
  });
}
