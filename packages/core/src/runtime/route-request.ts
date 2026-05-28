import { isServer } from "solid-js/web";
import type { Context } from "hono";
import { ssrStorage } from "./context.js";

export function createRouteRequest(pathname: string): Request {
  if (isServer) {
    const honoContext = ssrStorage.getStore()?.get("honoContext") as Context | undefined;
    const request = honoContext?.req?.raw;
    if (request) return request;
    return new Request(new URL(pathname, "http://localhost").toString());
  }
  return new Request(new URL(pathname, window.location.origin).toString());
}