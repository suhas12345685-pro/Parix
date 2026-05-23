type Fetcher = typeof fetch;

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * Wraps a fetch call with an AbortController-based timeout so a hung provider
 * cannot block the router's fallback chain forever. An abort surfaces as a
 * thrown error, which the router treats like any other provider failure.
 */
export async function fetchWithTimeout(
  fetcher: Fetcher,
  input: Parameters<Fetcher>[0],
  init: Parameters<Fetcher>[1] = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
