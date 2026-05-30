import { AsyncLocalStorage } from "node:async_hooks";

type AnyFn = (...args: unknown[]) => unknown;

export const serverFunctionsRegistry = new Map<string, AnyFn>();
export const ssrStorage = new AsyncLocalStorage<Map<string, unknown>>();
(globalThis as unknown as Record<string, unknown>).__ANAEMIA_SERVER_STORAGE__ = ssrStorage;

export function runOnServer<T extends AnyFn>(backendFn: T, id?: string): T & { id: string } {
  const hashId = id || "";
  serverFunctionsRegistry.set(hashId, backendFn);

  const rpcProxy = async function (...args: unknown[]) {
    const result = await backendFn(...args);
    const store = ssrStorage.getStore();
    if (store && hashId) {
      if (!store.has("__SERVER_FUNCTION_DATA__")) {
        store.set("__SERVER_FUNCTION_DATA__", {});
      }
      const functionCache = store.get("__SERVER_FUNCTION_DATA__") as Record<string, Record<string, unknown>>;
      if (!functionCache[hashId]) {
        functionCache[hashId] = {};
      }
      const paramKey = JSON.stringify(args);
      functionCache[hashId][paramKey] = result;
    }
    return result;
  };
  rpcProxy.id = hashId;
  return rpcProxy as unknown as T & { id: string };
}