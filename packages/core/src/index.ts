export * from "./config.js";

export { runOnServer, registerRpcPolicy } from "./runtime/context.js";
export { OverwriteHead, useSSRDocument } from "./runtime/document.js";
export { RouteDataController, useRouteData } from "./runtime/route-data.js";
export { $$executeClientRpc, getRpcToken } from "./runtime/rpc-client.js";
export { createServerResource } from "./runtime/resources.js";

export type {
  LoaderArgs,
  LoaderFunction,
  InferServerData,
  GuardContext,
  GuardResult,
  GuardFn,
  ServerFunction,
  RpcPolicy,
  RpcPolicyContext,
} from "./types.js";

export type { Context as ServerContext, Env as ServerEnv, Input as ServerInput } from "hono";
export type { Hono as ServerApp } from "hono";
