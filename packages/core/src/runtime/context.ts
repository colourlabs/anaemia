import { AsyncLocalStorage } from "node:async_hooks";

export const serverFunctionsRegistry = new Map<string, Function>();
export const ssrStorage = new AsyncLocalStorage<Map<string, any>>();

(globalThis as any).__ANAEMIA_SERVER_STORAGE__ = ssrStorage;

export function runOnServer(backendFn: Function, id?: string) {
  const hashId = id || "";

  const rpcProxy = async function (...args: any[]) {
    const result = await backendFn(...args);

    const store = ssrStorage.getStore();
    if (store && hashId) {
      if (!store.has("__SERVER_FUNCTION_DATA__")) {
        store.set("__SERVER_FUNCTION_DATA__", {});
      }
      
      const functionCache = store.get("__SERVER_FUNCTION_DATA__");
      if (!functionCache[hashId]) {
        functionCache[hashId] = {};
      }
      
      const paramKey = JSON.stringify(args);
      functionCache[hashId][paramKey] = result;
    }

    return result;
  };

  rpcProxy.id = hashId;
  return rpcProxy;
}