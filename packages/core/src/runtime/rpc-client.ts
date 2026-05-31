import { isServer } from "solid-js/web";
import { ANAEMIA_DATA_SCRIPT_ID, RPC_PATH, SERVER_FUNCTION_DATA_KEY } from "./shared/constants.js";

interface CacheMatch {
  matchingKey: string;
  data: unknown;
}

interface ServerFunctionCache {
  [hashId: string]: Record<string, unknown>;
}

interface AnaemiaClientCache {
  [SERVER_FUNCTION_DATA_KEY]?: ServerFunctionCache;
}

interface AnaemiaServerStorage {
  getStore?: () => Map<string, unknown> | undefined;
}

interface AnaemiaGlobal {
  __ANAEMIA_SERVER_STORAGE__?: AnaemiaServerStorage;
}

let _clientCache: AnaemiaClientCache | null = null;

function ensureCacheInitialized() {
  if (isServer || _clientCache) return;
  const script = document.getElementById(ANAEMIA_DATA_SCRIPT_ID);
  try {
    _clientCache = JSON.parse(script?.textContent || "{}") as AnaemiaClientCache;
  } catch {
    _clientCache = {};
  }
}

function findLooseCacheMatch(
  serverFunctionData: Record<string, unknown> | null | undefined,
  targetArg: string,
): CacheMatch | undefined {
  if (!serverFunctionData) return undefined;
  const strictKey = JSON.stringify([targetArg]);
  if (strictKey in serverFunctionData) {
    return { matchingKey: strictKey, data: serverFunctionData[strictKey] };
  }
  const lookUpString = `["${targetArg}"`;
  const matchedKey = Object.keys(serverFunctionData).find((key) => key.startsWith(lookUpString));
  return matchedKey ? { matchingKey: matchedKey, data: serverFunctionData[matchedKey] } : undefined;
}

function getServerStore(): Map<string, unknown> | undefined {
  return (globalThis as unknown as AnaemiaGlobal).__ANAEMIA_SERVER_STORAGE__?.getStore?.();
}

export function $$executeClientRpc(hashId: string) {
  const asyncRpcCall = async function (...args: unknown[]) {
    if (isServer) {
      const store = getServerStore();
      if (store) {
        const functionCache = store.get(SERVER_FUNCTION_DATA_KEY) as ServerFunctionCache | undefined;
        if (functionCache?.[hashId]) {
          const match = findLooseCacheMatch(functionCache[hashId], args[0] as string);
          if (match) return match.data;
        }
      }
      return;
    }

    ensureCacheInitialized();
    const serverFunctionData = _clientCache?.[SERVER_FUNCTION_DATA_KEY]?.[hashId];
    const match = findLooseCacheMatch(serverFunctionData ?? {}, args[0] as string);
    if (match) {
      const { matchingKey, data } = match;
      delete serverFunctionData![matchingKey];
      return data;
    }

    const response = await fetch(`${RPC_PATH}?id=${hashId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`[anaemia] RPC execution failed: ${response.status}`);
    return (await response.json()) as unknown;
  };

  asyncRpcCall.id = hashId;
  asyncRpcCall.readHydrationCache = function (...args: unknown[]) {
    if (isServer) {
      const store = getServerStore();
      if (store) {
        const functionCache = store.get(SERVER_FUNCTION_DATA_KEY) as ServerFunctionCache | undefined;
        if (functionCache?.[hashId]) {
          const match = findLooseCacheMatch(functionCache[hashId], args[0] as string);
          if (match) return match.data;
        }
      }
      return;
    }

    ensureCacheInitialized();
    const serverFunctionData = _clientCache?.[SERVER_FUNCTION_DATA_KEY]?.[hashId];
    const match = findLooseCacheMatch(serverFunctionData ?? {}, args[0] as string);
    return match ? match.data : undefined;
  };

  return asyncRpcCall;
}
