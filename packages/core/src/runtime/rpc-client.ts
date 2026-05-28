import { isServer } from "solid-js/web";

interface CacheMatch {
  matchingKey: string;
  data: unknown;
}

interface ServerFunctionCache {
  [hashId: string]: Record<string, unknown>;
}

interface AnaemiaClientCache {
  __SERVER_FUNCTION_DATA__?: ServerFunctionCache;
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
  const script = document.getElementById("__ANAEMIA_DATA__");
  try {
    _clientCache = JSON.parse(script?.textContent || "{}") as AnaemiaClientCache;
  } catch {
    _clientCache = {};
  }
}

function findLooseCacheMatch(
  serverFunctionData: Record<string, unknown>,
  targetArg: string
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
        const functionCache = store.get("__SERVER_FUNCTION_DATA__") as ServerFunctionCache | undefined;
        if (functionCache?.[hashId]) {
          const match = findLooseCacheMatch(functionCache[hashId], args[0] as string);
          if (match) return match.data;
        }
      }
      return undefined;
    }

    ensureCacheInitialized();
    const serverFunctionData = _clientCache?.__SERVER_FUNCTION_DATA__?.[hashId];
    const match = findLooseCacheMatch(serverFunctionData ?? {}, args[0] as string);
    if (match) {
      const { matchingKey, data } = match;
      delete serverFunctionData![matchingKey];
      return data;
    }

    const response = await fetch(`/_rpc?id=${hashId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`[anaemia] RPC execution failed: ${response.status}`);
    return await response.json() as unknown;
  };

  asyncRpcCall.id = hashId;
  asyncRpcCall.readHydrationCache = function (...args: unknown[]) {
    if (isServer) {
      const store = getServerStore();
      if (store) {
        const functionCache = store.get("__SERVER_FUNCTION_DATA__") as ServerFunctionCache | undefined;
        if (functionCache?.[hashId]) {
          const match = findLooseCacheMatch(functionCache[hashId], args[0] as string);
          if (match) return match.data;
        }
      }
      return undefined;
    }

    ensureCacheInitialized();
    const serverFunctionData = _clientCache?.__SERVER_FUNCTION_DATA__?.[hashId];
    const match = findLooseCacheMatch(serverFunctionData ?? {}, args[0] as string);
    return match ? match.data : undefined;
  };

  return asyncRpcCall;
}