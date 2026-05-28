import { isServer } from "solid-js/web";
import { ssrStorage } from "./context.js";
export function createRouteRequest(pathname) {
    if (isServer) {
        const request = ssrStorage.getStore()?.get("honoContext")?.req?.raw;
        if (request)
            return request;
        return new Request(new URL(pathname, "http://localhost").toString());
    }
    return new Request(new URL(pathname, window.location.origin).toString());
}
