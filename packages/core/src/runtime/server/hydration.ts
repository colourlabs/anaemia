import { generateHydrationScript } from "solid-js/web";
import { ANAEMIA_DATA_SCRIPT_ID, LOADER_DATA_KEY, SERVER_FUNCTION_DATA_KEY } from "../shared/constants.js";

export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\//g, "\\u002f");
}

export function createHydrationDataScript(store: Map<string, unknown>): string {
  const rawStorePayload = Object.fromEntries(store);
  const finalHydrationStatePayload = {
    [LOADER_DATA_KEY]: rawStorePayload[LOADER_DATA_KEY] || {},
    [SERVER_FUNCTION_DATA_KEY]: rawStorePayload[SERVER_FUNCTION_DATA_KEY] || {},
  };

  return `<script id="${ANAEMIA_DATA_SCRIPT_ID}" type="application/json">${serializeJsonForHtml(
    finalHydrationStatePayload,
  )}</script>\n`;
}

export function createHydrationHeadScripts(store: Map<string, unknown>): string {
  return `${createHydrationDataScript(store)}${generateHydrationScript()}`;
}

export function createHydrationRuntimeScript(): string {
  return generateHydrationScript();
}
