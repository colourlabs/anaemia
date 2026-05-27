import { AsyncLocalStorage } from "node:async_hooks";

export const serverFunctionsRegistry = new Map<string, Function>();
export const ssrStorage = new AsyncLocalStorage<Map<string, any>>();

export type ServerFunction<Args extends any[], Return> = ((...args: Args) => Promise<Return>) & {
  urlId?: string;
};

export function runOnServer<Args extends any[], Return>(fn: (...args: Args) => Promise<Return> | Return): ServerFunction<Args, Return> {
  const wrapper: ServerFunction<Args, Return> = async (...args: Args) => {
    const store = ssrStorage.getStore();
    const currentId = wrapper.urlId;

    if (store && currentId) {
      const result = await fn(...args);
      store.set(currentId, result);
      return result;
    }

    return fn(...args);
  };

  if (wrapper.urlId) {
    serverFunctionsRegistry.set(wrapper.urlId, fn);
  }

  return wrapper;
}
