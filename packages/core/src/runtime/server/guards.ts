export type GuardFn = (ctx: {
  params: Record<string, string>;
  request: Request;
  url: string;
}) =>
  | void
  | undefined
  | { redirect: string; status?: 301 | 302 | 307 | 308 }
  | { status: number; body?: string }
  | Promise<void | undefined | { redirect: string; status?: number } | { status: number; body?: string }>;

export async function runGuards(
  serverGuardRegistry: Map<string, (() => Promise<GuardFn[]>)[]>,
  pattern: string,
  ctx: { params: Record<string, string>; request: Request; url: string },
) {
  const chain = serverGuardRegistry.get(pattern) ?? [];
  for (const loadGuards of chain) {
    const guards = await loadGuards();
    for (const guard of guards) {
      const result = await guard(ctx);
      if (result && ("redirect" in result || "status" in result)) return result;
    }
  }
  return null;
}
