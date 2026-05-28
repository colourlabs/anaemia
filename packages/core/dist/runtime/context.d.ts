import { AsyncLocalStorage } from "node:async_hooks";
type AnyFn = (...args: unknown[]) => unknown;
export declare const serverFunctionsRegistry: Map<string, AnyFn>;
export declare const ssrStorage: AsyncLocalStorage<Map<string, unknown>>;
export declare function runOnServer<T extends AnyFn>(backendFn: T, id?: string): T & {
    id: string;
};
export {};
//# sourceMappingURL=context.d.ts.map