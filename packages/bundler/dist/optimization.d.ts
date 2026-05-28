export declare function getClientOptimization(isDev: boolean): {
    sideEffects: boolean;
    usedExports: boolean;
    splitChunks: false | {
        readonly chunks: "all";
        readonly maxInitialRequests: 25;
        readonly minSize: 20000;
        readonly cacheGroups: {
            readonly framework: {
                readonly chunks: "all";
                readonly name: "framework";
                readonly test: RegExp;
                readonly priority: 40;
                readonly enforce: true;
            };
            readonly vendor: {
                readonly chunks: "all";
                readonly name: "vendor";
                readonly test: RegExp;
                readonly priority: 30;
            };
        };
    };
    minimizer: {
        name: string;
        _args: [options?: import("@rspack/core").SwcJsMinimizerRspackPluginOptions | undefined];
        affectedHooks: keyof import("@rspack/core").CompilerHooks | undefined;
        raw(compiler: import("@rspack/core").Compiler): import("@rspack/binding").BuiltinPlugin;
        apply(compiler: import("@rspack/core").Compiler): void;
    }[];
};
export declare function getPerformanceProfile(isDev: boolean): {
    hints: false;
    maxAssetSize: number;
    maxEntrypointSize: number;
} | {
    hints: "warning";
    maxAssetSize: number;
    maxEntrypointSize: number;
};
//# sourceMappingURL=optimization.d.ts.map