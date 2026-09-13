import { generateHydrationScript } from "solid-js/web";
import { ANAEMIA_DATA_SCRIPT_ID, LOADER_DATA_KEY, RPC_TOKEN_KEY, SERVER_FUNCTION_DATA_KEY } from "../constants.js";

function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\//g, "\\u002f");
}

export function createHydrationDataScript(store: Map<string, unknown>): string {
  const rawStorePayload = Object.fromEntries(store);
  const finalHydrationStatePayload: Record<string, unknown> = {
    [LOADER_DATA_KEY]: rawStorePayload[LOADER_DATA_KEY] || {},
    [SERVER_FUNCTION_DATA_KEY]: rawStorePayload[SERVER_FUNCTION_DATA_KEY] || {},
  };

  const rpcToken = rawStorePayload[RPC_TOKEN_KEY];
  if (typeof rpcToken === "string") {
    finalHydrationStatePayload[RPC_TOKEN_KEY] = rpcToken;
  }

  return `<script id="${ANAEMIA_DATA_SCRIPT_ID}" type="application/json">${serializeJsonForHtml(
    finalHydrationStatePayload,
  )}</script>\n`;
}

const runtimeScriptCache: { script: string } = { script: "" };

export function createHydrationRuntimeScript(): string {
  if (!runtimeScriptCache.script) runtimeScriptCache.script = generateHydrationScript();
  return runtimeScriptCache.script;
}
