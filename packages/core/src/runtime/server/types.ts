import type { StatusCode } from "hono/utils/http-status";

export interface ChunkAssets {
  js?: string[];
  css?: Array<string | ChunkCssAsset>;
}

export type ChunkCssAsset = {
  href: string;
  critical?: boolean;
  content?: string;
  defer?: boolean;
  media?: string;
  size?: number;
  modules?: Array<{
    filePath: string;
    classes: string[];
    usedClasses?: string[];
    unusedClasses?: string[];
  }>;
};

export type RouteManifest = {
  routes: Array<{
    urlPattern: string;
    chunkName: string;
    params: string[];
    isStatic: boolean;
    hasLoader: boolean;
    hasGuard: boolean;
    serverFunctionIds: string[];
    cssModules?: CssModuleInfo[];
  }>;
  chunks: Record<string, ChunkAssets>;
  cssModules?: CssModuleInfo[];
  errors?: Record<string, string>;
};

export type CssModuleInfo = {
  filePath: string;
  relativePath: string;
  classes: string[];
  usedClasses: string[];
  unusedClasses: string[];
  importers: string[];
};

export type RouteMatch = {
  activeChunk: string;
  targetPattern: string;
  statusCode: StatusCode;
  params: Record<string, string>;
};

export type RuntimeEnv = {
  port: number;
  isDev: boolean;
  devServerUrl: string;
  templatePath: string;
  manifestPath: string;
  clientDistPath: string;
};
