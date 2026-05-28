import { createResource, type ResourceOptions, type ResourceReturn } from "solid-js";
import { isServer } from "solid-js/web";

interface ServerStorage {
  getStore?: () => Map<string, unknown> | undefined;
}

interface AnaemiaGlobal {
  __ANAEMIA_SERVER_STORAGE__?: ServerStorage;
}

type FnCache = Record<string, unknown>;
type ServerFunctionData = Record<string, FnCache>;

export function createServerResource<Source, Return>(
  source: () => Source,
  serverFn: ((sourceData: Source) => Promise<Return>) & {
    readHydrationCache?: (s: Source) => Return | undefined;
    id?: string;
  },
  options?: ResourceOptions<Return, Source>
): ResourceReturn<Return, unknown> {
  if (isServer) {
    let ssrInitialValue: Return | undefined = undefined;
    const store = (globalThis as unknown as AnaemiaGlobal).__ANAEMIA_SERVER_STORAGE__?.getStore?.();

    if (store && serverFn.id) {
      const fnData = store.get("__SERVER_FUNCTION_DATA__") as ServerFunctionData | undefined;
      const fnCache = fnData?.[serverFn.id];
      if (fnCache) {
        const key = JSON.stringify([source()]);
        if (fnCache[key] !== undefined) ssrInitialValue = fnCache[key] as Return;
      }
    }

    return createResource(source, serverFn, {
      ...options,
      initialValue: ssrInitialValue !== undefined ? ssrInitialValue : options?.initialValue,
      ssrLoadFrom: ssrInitialValue !== undefined ? "initial" : options?.ssrLoadFrom,
    }) as ResourceReturn<Return, unknown>;
  }

  let hydrationChecked = false;
  const wrappedFetcher = (s: Source): Promise<Return> => {
    if (!hydrationChecked) {
      hydrationChecked = true;
      if (typeof serverFn.readHydrationCache === "function") {
        const cached = serverFn.readHydrationCache(s);
        if (cached !== undefined) return Promise.resolve(cached);
      }
    }
    return serverFn(s);
  };

  (wrappedFetcher as typeof serverFn).id = serverFn.id;
  (wrappedFetcher as typeof serverFn).readHydrationCache = serverFn.readHydrationCache;

  return createResource(source, wrappedFetcher, options) as ResourceReturn<Return, unknown>;
}