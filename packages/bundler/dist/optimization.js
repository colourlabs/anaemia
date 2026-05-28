import { rspack } from "@rspack/core";
export function getClientOptimization(isDev) {
    return {
        sideEffects: true,
        usedExports: true,
        splitChunks: isDev
            ? false
            : {
                chunks: "all",
                maxInitialRequests: 25,
                minSize: 20000,
                cacheGroups: {
                    framework: {
                        chunks: "all",
                        name: "framework",
                        test: /[\\/]node_modules[\\/](solid-js|@solidjs[\\/]router)[\\/]/,
                        priority: 40,
                        enforce: true,
                    },
                    vendor: {
                        chunks: "all",
                        name: "vendor",
                        test: /[\\/]node_modules[\\/]/,
                        priority: 30,
                    },
                },
            },
        minimizer: isDev ? [] : [new rspack.SwcJsMinimizerRspackPlugin()],
    };
}
export function getPerformanceProfile(isDev) {
    return isDev
        ? { hints: false, maxAssetSize: 1000000, maxEntrypointSize: 1000000 }
        : { hints: "warning", maxAssetSize: 307200, maxEntrypointSize: 512000 };
}
