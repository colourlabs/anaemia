export * from "./config.js";
export { runOnServer } from "./runtime/context.js";
export { RouteDataController, useRouteData } from "./runtime/route-data.js";
export { $$executeClientRpc } from "./runtime/rpc-client.js";
export { createServerResource } from "./runtime/resources.js";
export type ServerFunction<Args extends any[], Return> = ((...args: Args) => Promise<Return>) & {
    id?: string;
    urlId?: string;
};
export type { LoaderArgs, LoaderFunction, InferServerData, GuardContext, GuardResult, GuardFn } from "./types.js";
//# sourceMappingURL=index.d.ts.map