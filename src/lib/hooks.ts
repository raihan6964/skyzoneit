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
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (json as { error?: string }).error || `Request failed (${response.status})`
    );
  }
  return json as T;
}
