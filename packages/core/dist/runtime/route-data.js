import { createContext, useContext, createResource, createComponent } from "solid-js";
import { isServer } from "solid-js/web";
import { useParams, useLocation } from "@solidjs/router";
import { ssrStorage } from "./context.js";
import { createRouteRequest } from "./route-request.js";
const RouteDataContext = createContext();
let hasReadClientHydrationData = false;
function readSSRData() {
    if (isServer) {
        return ssrStorage.getStore()?.get("__LOADER_DATA__");
    }
    if (hasReadClientHydrationData)
        return undefined;
    hasReadClientHydrationData = true;
    const el = document.getElementById("__ANAEMIA_DATA__");
    if (!el?.textContent)
        return undefined;
    try {
        return JSON.parse(el.textContent).__LOADER_DATA__;
    }
    catch {
        return undefined;
    }
}
export function RouteDataController(props) {
    const params = useParams();
    const location = useLocation();
    const ssrData = readSSRData();
    const [resource] = createResource(() => location.pathname, () => {
        if (isServer && ssrData !== undefined)
            return ssrData;
        return props.loader({
            params,
            location,
            request: createRouteRequest(location.pathname),
        });
    }, {
        initialValue: ssrData,
        ssrLoadFrom: "initial",
    });
    return createComponent(RouteDataContext.Provider, {
        value: { data: resource },
        get children() {
            return props.children;
        },
    });
}
export function useRouteData() {
    const ctx = useContext(RouteDataContext);
    if (!ctx) {
        throw new Error("useRouteData must be used inside RouteDataController");
    }
    return ctx.data;
}
