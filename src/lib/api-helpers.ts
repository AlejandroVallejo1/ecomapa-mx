/**
 * Shared fetch utilities and the withFallback pattern.
 *
 * Every live data fetch goes through `withFallback` so that the UI always
 * has *something* to show even when external APIs are unreachable.
 */

import type { ApiResponse, DataSource } from "@/types";

// ── withFallback ──────────────────────────────────────────────────────

/**
 * Try `fetchLive`; on failure (or empty results) return `sampleData`
 * with `meta.fallback = true`.
 */
export async function withFallback<T>(
  fetchLive: () => Promise<T[]>,
  sampleData: T[],
  source: DataSource
): Promise<ApiResponse<T>> {
  try {
    const results = await fetchLive();
    if (results.length === 0) throw new Error("Empty results");
    return {
      results,
      meta: {
        source,
        fetchedAt: new Date().toISOString(),
        totalResults: results.length,
        fallback: false,
      },
    };
  } catch {
    return {
      results: sampleData,
      meta: {
        source: "sample",
        fetchedAt: new Date().toISOString(),
        totalResults: sampleData.length,
        fallback: true,
      },
    };
  }
}

// ── fetchWithTimeout ──────────────────────────────────────────────────

/**
 * Thin wrapper around `fetch` that:
 *  - aborts after `timeoutMs` (default 8 s)
 *  - throws on non-2xx status codes
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 8000, ...fetchOptions } = options || {};
  const res = await fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}
