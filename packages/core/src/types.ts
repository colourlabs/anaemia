import type { RedirectStatusCode } from "hono/utils/http-status";

/**
 * the standard argument object injected into every server-side page loader.
 */
export interface LoaderArgs<Params extends Record<string, string> = Record<string, string>> {
  /** parsed URL dynamic variables (e.g., { id: "123" } from /users/[id]) */
  params: Params;
  /** the native underlying Web API Request object from the Hono server instance */
  request: Request;
}

/**
 * represents an application page loader function.
 */
export type LoaderFunction<ResponseData = unknown, Params extends Record<string, string> = Record<string, string>> = (args: LoaderArgs<Params>) => Promise<ResponseData> | ResponseData;

/**
 * extracts and unwraps the true data structure returned by a server function or loader.
 * essential for typing useRouteData() effortlessly in user-space.
 */
export type InferServerData<T extends (...args: unknown[]) => unknown> = Awaited<ReturnType<T>>;

export type GuardContext = {
  params: Record<string, string>;
  request: Request;
  url: string;
};

export type GuardResult = void | undefined | { redirect: string; status?: 301 | 302 | 307 | 308 } | { status: 401 | 403 | 404 | 500; body?: string };

export type GuardFn = (ctx: { params: Record<string, string>; request: Request; url: string }) => void | undefined | { redirect: string; status?: RedirectStatusCode } | { status: number; body?: string } | Promise<void | undefined | { redirect: string; status?: RedirectStatusCode } | { status: number; body?: string }>;
