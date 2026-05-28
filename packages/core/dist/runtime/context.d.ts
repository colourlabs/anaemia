import { AsyncLocalStorage } from "node:async_hooks";
export declare const serverFunctionsRegistry: Map<string, Function>;
export declare const ssrStorage: AsyncLocalStorage<Map<string, any>>;
export declare function runOnServer(backendFn: Function, id?: string): {
    (...args: any[]): Promise<any>;
    id: string;
};
//# sourceMappingURL=context.d.ts.map