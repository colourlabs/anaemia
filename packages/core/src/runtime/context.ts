import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export const serverFunctionsRegistry = new Map<string, Function>();
export const ssrStorage = new AsyncLocalStorage<Map<string, any>>();

export type ServerFunction<Args extends any[], Return> = ((...args: Args) => Promise<Return>) & {
  id?: string;
  urlId?: string;
};

const SERVER_FUNCTION_DATA_KEY = "__SERVER_FUNCTION_DATA__";

function cacheKey(args: unknown[]) {
  try {
    return JSON.stringify(args);
  } catch {
    return "";
  }
}

export function runOnServer<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return> | Return,
  explicitId?: string
): ServerFunction<Args, Return> {
  const id =
    explicitId ||
    fn.name ||
    crypto.randomUUID();

  serverFunctionsRegistry.set(id, fn);

  const serverFunction = (async (...args: Args) => {
    const result = await fn(...args);
    const store = ssrStorage.getStore();

    if (store) {
      const data = store.get(SERVER_FUNCTION_DATA_KEY) ?? {};
      const entries = data[id] ?? {};
      entries[cacheKey(args)] = result;
      data[id] = entries;
      store.set(SERVER_FUNCTION_DATA_KEY, data);
    }

    return result;
  }) as ServerFunction<Args, Return>;

  serverFunction.id = id;
  serverFunction.urlId = id;

  return serverFunction;
}
