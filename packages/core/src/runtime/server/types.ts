import type { StatusCode } from "hono/utils/http-status";

export interface ChunkAssets {
  js?: string[];
  css?: string[];
}

export type RouteManifest = {
  routes: Array<{
    urlPattern: string;
    chunkName: string;
    params: string[];
    isStatic: boolean;
    hasLoader: boolean;
    hasGuard: boolean;
    serverFunctionIds: string[];
  }>;
  chunks: Record<string, ChunkAssets>;
  errors?: Record<string, string>;
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
