import { Configuration } from "@rspack/core";
import type { AnaemiaConfig } from "@anaemia/core/config";
export declare function getRspackConfig(appRoot: string, config?: AnaemiaConfig): Promise<[Configuration, Configuration]>;
export { scanRoutes } from "./router/scan.js";
export { writeManifest } from "./router/manifest.js";
//# sourceMappingURL=index.d.ts.map