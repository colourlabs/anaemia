/**
 * static route HTML is cached so the first render per path is reused for
 * subsequent requests. Entries are LRU-evicted on overflow and expire after
 * `maxAgeMs`, which callers advertise as the HTML Cache-Control max-age. The
 * TTL also keeps the embedded per-render RPC token fresh (default token
 * lifetime is 3600 seconds).
 */
export const STATIC_CACHE_MAX_AGE_SECONDS = 300;

type StaticCacheEntry = { html: string; expiresAt: number };

export function createStaticHtmlCache(maxAgeMs: number, maxEntries: number) {
  const cache = new Map<string, StaticCacheEntry>();

  return {
    get(key: string): string | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;

      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
      }

      // refresh position in insertion-order (LRU)
      cache.delete(key);
      cache.set(key, entry);

      return entry.html;
    },

    set(key: string, html: string): void {
      if (cache.size >= maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }

      cache.set(key, { html, expiresAt: Date.now() + maxAgeMs });
    },
  };
}

export function createStaticHtmlCacheForHtml(): StaticHtmlCache {
  return createStaticHtmlCache(STATIC_CACHE_MAX_AGE_SECONDS * 1000, 100);
}

export type StaticHtmlCache = ReturnType<typeof createStaticHtmlCache>;
