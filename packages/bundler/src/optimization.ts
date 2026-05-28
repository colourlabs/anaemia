import { rspack } from "@rspack/core";

export function getClientOptimization(isDev: boolean) {
  return {
    sideEffects: true,
    usedExports: true,
    splitChunks: isDev
      ? (false as const)
      : ({
          chunks: "all" as const,
          maxInitialRequests: 25,
          minSize: 20000,
          cacheGroups: {
            framework: {
              chunks: "all" as const,
              name: "framework",
              test: /[\\/]node_modules[\\/](solid-js|@solidjs[\\/]router)[\\/]/,
              priority: 40,
              enforce: true,
            },
            vendor: {
              chunks: "all" as const,
              name: "vendor",
              test: /[\\/]node_modules[\\/]/,
              priority: 30,
            },
          },
        } as const),
    minimizer: isDev ? [] : [new rspack.SwcJsMinimizerRspackPlugin()],
  };
}

export function getPerformanceProfile(isDev: boolean) {
  return isDev
    ? { hints: false as const, maxAssetSize: 1000000, maxEntrypointSize: 1000000 }
    : { hints: "warning" as const, maxAssetSize: 307200, maxEntrypointSize: 512000 };
}