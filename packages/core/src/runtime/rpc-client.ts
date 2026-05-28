import { isServer } from "solid-js/web";

let _clientCache: any = null;

function ensureCacheInitialized() {
  if (isServer || _clientCache) return;
  const script = document.getElementById("__ANAEMIA_DATA__");
  try {
    _clientCache = JSON.parse(script?.textContent || "{}");
  } catch {
    _clientCache = {};
  }
}

function findLooseCacheMatch(serverFunctionData: Record<string, any>, targetArg: string) {
  if (!serverFunctionData) return undefined;

  const strictKey = JSON.stringify([targetArg]);
  if (strictKey in serverFunctionData) {
    return { matchingKey: strictKey, data: serverFunctionData[strictKey] };
  }

  const lookUpString = `["${targetArg}"`;
  const matchedKey = Object.keys(serverFunctionData).find(key => key.startsWith(lookUpString));

  return matchedKey ? { matchingKey: matchedKey, data: serverFunctionData[matchedKey] } : undefined;
}

export function $$executeClientRpc(hashId: string) {
  const asyncRpcCall = async function (...args: unknown[]) {
    if (isServer) {
      const globalStorage = (globalThis as any).__ANAEMIA_SERVER_STORAGE__;
      const store = globalStorage?.getStore();
      if (store) {
        const functionCache = store.get("__SERVER_FUNCTION_DATA__");
        if (functionCache && functionCache[hashId]) {
          const match = findLooseCacheMatch(functionCache[hashId], args[0] as string);
          if (match) return match.data;
        }
      }
      return undefined;
    }

    ensureCacheInitialized();
    const serverFunctionData = _clientCache.__SERVER_FUNCTION_DATA__?.[hashId];
    const match = findLooseCacheMatch(serverFunctionData, args[0] as string);

    if (match) {
      const { matchingKey, data } = match;
      delete serverFunctionData[matchingKey];
      return data;
    }

    const response = await fetch(`/_rpc?id=${hashId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!response.ok) throw new Error(`[anaemia] RPC execution failed: ${response.status}`);
    return await response.json();
  };

  asyncRpcCall.id = hashId;

  asyncRpcCall.readHydrationCache = function (...args: unknown[]) {
    if (isServer) {
      const globalStorage = (globalThis as any).__ANAEMIA_SERVER_STORAGE__;
      const store = globalStorage?.getStore();
      if (store) {
        const functionCache = store.get("__SERVER_FUNCTION_DATA__");
        if (functionCache && functionCache[hashId]) {
          const match = findLooseCacheMatch(functionCache[hashId], args[0] as string);
          if (match) return match.data;
        }
      }
      return undefined;
    }

    ensureCacheInitialized();
    const serverFunctionData = _clientCache.__SERVER_FUNCTION_DATA__?.[hashId];
    const match = findLooseCacheMatch(serverFunctionData, args[0] as string);
    return match ? match.data : undefined;
  };

  return asyncRpcCall;
}