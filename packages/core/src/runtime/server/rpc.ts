import type { Hono } from "hono";
import { serverFunctionsRegistry } from "../context.js";
import { RPC_PATH } from "../shared/constants.js";

export function registerRpcRoute(app: Hono) {
  app.post(RPC_PATH, async (c) => {
    const functionId = c.req.query("id");
    if (!functionId || !serverFunctionsRegistry.has(functionId)) {
      return c.json({ error: "RPC function not found" }, 404);
    }

    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > 512_000) {
      return c.json({ error: "Payload too large" }, 413);
    }

    let argumentsArray: unknown[];
    try {
      const body = await c.req.json();
      if (!Array.isArray(body)) throw new Error("Expected array");
      argumentsArray = body;
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    try {
      const result = await serverFunctionsRegistry.get(functionId)!(...argumentsArray);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      return c.json({ error: message }, 500);
    }
  });
}
