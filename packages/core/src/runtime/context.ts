import { AsyncLocalStorage } from "node:async_hooks";
import type { RpcPolicy } from "../types.js";
import { SERVER_FUNCTION_DATA_KEY } from "./constants.js";

type AnyFn = (...args: unknown[]) => unknown;

export const serverFunctionsRegistry = new Map<string, AnyFn>();

/**
 * optional per-function authorization policies consulted by /_rpc before a
 * server function executes. register via registerRpcPolicy().
 */
export const serverFunctionPolicies = new Map<string, RpcPolicy>();

export function registerRpcPolicy(functionId: string, policy: RpcPolicy): void {
  serverFunctionPolicies.set(functionId, policy);
}

export const ssrStorage = new AsyncLocalStorage<Map<string, unknown>>();
(globalThis as unknown as Record<string, unknown>).__ANAEMIA_SERVER_STORAGE__ = ssrStorage;

export function runOnServer<T extends AnyFn>(backendFn: T, id?: string): T & { id: string } {
  const hashId = id ?? crypto.randomUUID();
  serverFunctionsRegistry.set(hashId, backendFn);

  const rpcProxy = async function (...args: unknown[]) {
    const result = await backendFn(...args);
    const store = ssrStorage.getStore();
    if (store && hashId) {
      if (!store.has(SERVER_FUNCTION_DATA_KEY)) {
        store.set(SERVER_FUNCTION_DATA_KEY, {});
      }
      const functionCache = store.get(SERVER_FUNCTION_DATA_KEY) as Record<string, Record<string, unknown> | undefined>;
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
