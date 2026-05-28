import { createResource } from "solid-js";
import { isServer } from "solid-js/web";
export function createServerResource(source, serverFn, options) {
    if (isServer) {
        let ssrInitialValue = undefined;
        const store = globalThis.__ANAEMIA_SERVER_STORAGE__?.getStore?.();
        if (store && serverFn.id) {
            const fnCache = store.get("__SERVER_FUNCTION_DATA__")?.[serverFn.id];
            if (fnCache) {
                const key = JSON.stringify([source()]);
                if (fnCache[key] !== undefined)
                    ssrInitialValue = fnCache[key];
            }
        }
        return createResource(source, serverFn, {
            ...options,
            initialValue: ssrInitialValue !== undefined ? ssrInitialValue : options?.initialValue,
            ssrLoadFrom: ssrInitialValue !== undefined ? "initial" : options?.ssrLoadFrom,
        });
    }
    let hydrationChecked = false;
    const wrappedFetcher = (s) => {
        if (!hydrationChecked) {
            hydrationChecked = true;
            if (typeof serverFn.readHydrationCache === "function") {
                const cached = serverFn.readHydrationCache(s);
                if (cached !== undefined)
                    return Promise.resolve(cached);
            }
        }
        return serverFn(s);
    };
    wrappedFetcher.id = serverFn.id;
    wrappedFetcher.readHydrationCache = serverFn.readHydrationCache;
    return createResource(source, wrappedFetcher, options);
}
