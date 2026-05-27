import type { Context } from "hono";

export async function GET(c: Context) {
  return c.json({ success: true });
};