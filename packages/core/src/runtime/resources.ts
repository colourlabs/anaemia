import { createResource, type ResourceOptions, type ResourceReturn } from "solid-js";
import { isServer } from "solid-js/web";

export function createServerResource<Source, Return>(
  source: () => Source,
  serverFn: ((sourceData: Source) => Promise<Return>) & {
    readHydrationCache?: (s: any) => any;
    id?: string;
  },
  options?: ResourceOptions<Return, Source>
): ResourceReturn<Return, unknown> {
  if (isServer) {
    let ssrInitialValue: any = undefined;
    const store: Map<string, any> | undefined = 
      (globalThis as any).__ANAEMIA_SERVER_STORAGE__?.getStore?.();

    if (store && serverFn.id) {
      const fnCache = store.get("__SERVER_FUNCTION_DATA__")?.[serverFn.id];
      if (fnCache) {
        const key = JSON.stringify([source()]);
        if (fnCache[key] !== undefined) ssrInitialValue = fnCache[key];
      }
    }

    return createResource(source, serverFn as any, {
      ...options,
      initialValue: ssrInitialValue !== undefined ? ssrInitialValue : options?.initialValue,
      ssrLoadFrom: ssrInitialValue !== undefined ? "initial" : options?.ssrLoadFrom,
    } as any) as ResourceReturn<Return, unknown>;
  }

  let hydrationChecked = false;

  const wrappedFetcher = (s: Source) => {
    if (!hydrationChecked) {
      hydrationChecked = true;
      if (typeof serverFn.readHydrationCache === "function") {
        const cached = serverFn.readHydrationCache(s);
        if (cached !== undefined) return Promise.resolve(cached);
      }
    }
    return serverFn(s);
  };

  (wrappedFetcher as any).id = serverFn.id;
  (wrappedFetcher as any).readHydrationCache = serverFn.readHydrationCache;

  return createResource(source, wrappedFetcher as any, options) as ResourceReturn<Return, unknown>;
}