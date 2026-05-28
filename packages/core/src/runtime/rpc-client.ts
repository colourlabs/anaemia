import { isServer } from "solid-js/web";

let _clientCache: any = null;

export function $$executeClientRpc(hashId: string) {
  return async function (...args: unknown[]) {
    if (isServer) return undefined;

    if (!_clientCache) {
      const script = document.getElementById("__ANAEMIA_DATA__");
      try {
        _clientCache = JSON.parse(script?.textContent || "{}");
      } catch (e) {
        _clientCache = {};
      }
    }

    const argsKey = JSON.stringify(args);
    const serverFunctionData = _clientCache.__SERVER_FUNCTION_DATA__?.[hashId];

    if (serverFunctionData && argsKey in serverFunctionData) {
      const data = serverFunctionData[argsKey];
      delete serverFunctionData[argsKey];
      return data;
    }

    const response = await fetch(`/_rpc?id=${hashId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      throw new Error(`[anaemia] RPC fallback failed with status: ${response.status}`);
    }

    return await response.json();
  };
}
