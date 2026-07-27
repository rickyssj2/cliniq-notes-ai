import { QueryClient } from "@tanstack/react-query";

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;
  const status = (error as { status?: number } | null)?.status;
  // Don't retry client/auth errors — only transient failures.
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return true;
}

/**
 * Mutations never auto-retry: callers own idempotency via clientMutationId
 * and the offline write queue (Phase 8). Blind retries would race coalesced saves.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      /** Keep cached reads available while offline (≥30 min per assignment). */
      gcTime: 35 * 60_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: false,
      networkMode: "offlineFirst",
    },
  },
});
