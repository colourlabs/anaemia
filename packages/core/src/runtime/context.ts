import { AsyncLocalStorage } from "node:async_hooks";

export const serverFunctionsRegistry = new Map<string, Function>();
export const ssrStorage = new AsyncLocalStorage<Map<string, any>>();

export function runOnServer(fn: Function, id?: string) {
  if (id) {
    serverFunctionsRegistry.set(id, fn);
  }

  return async (...args: any[]) => {
    const store = ssrStorage.getStore();

    if (store && id) {
      const result = await fn(...args);
      store.set(id, result);
      return result;
    }

    return fn(...args);
  };
}