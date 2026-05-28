import type { RspackPluginInstance, Compiler } from "@rspack/core";
interface HydrationPluginOptions {
    appRoot: string;
}
export declare class AnaemiaManifestHydrationPlugin implements RspackPluginInstance {
    private appRoot;
    constructor(options: HydrationPluginOptions);
    apply(compiler: Compiler): void;
}
export {};
//# sourceMappingURL=rspack-manifest-hydration.d.ts.map