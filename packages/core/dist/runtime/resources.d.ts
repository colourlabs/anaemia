import { type ResourceOptions, type ResourceReturn } from "solid-js";
export declare function createServerResource<Source, Return>(source: () => Source, serverFn: ((sourceData: Source) => Promise<Return>) & {
    readHydrationCache?: (s: Source) => Return | undefined;
    id?: string;
}, options?: ResourceOptions<Return, Source>): ResourceReturn<Return, unknown>;
//# sourceMappingURL=resources.d.ts.map