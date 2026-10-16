"use client";

import useSWR, { type SWRConfiguration } from "swr";

export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (json as { error?: string }).error || `Request failed (${response.status})`
    );
  }
  return json as T;
}

export function useApi<T>(url: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(url, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    ...config,
  });
}

export async function postJson<T>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST"
): Promise<T> {
  // Network-level failures ("fetch failed" — connection reset before a
  // response arrived) are transient on mobile connections: retry twice with
  // a short backoff. HTTP error responses are thrown as plain Errors below
  // and are NOT retried.
  let lastNetworkError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (json as { error?: string } | null)?.error ||
            `Request failed (${response.status})`
        );
      }
      if (json === null) {
        // Response arrived but body was unreadable — treat as transient.
        throw new TypeError("fetch failed");
      }
      return json as T;
    } catch (error) {
      const isNetwork =
        error instanceof TypeError && /fetch failed|network|terminated/i.test(error.message);
      if (!isNetwork || attempt === 3) throw error;
      lastNetworkError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastNetworkError;
}
