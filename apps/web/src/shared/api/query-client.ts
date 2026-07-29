import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { reportError } from "@shared/errors";

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
  queryCache: new QueryCache({
    onError(error, query) {
      const key0 = query.queryKey[0];
      reportError({
        source: "query",
        error,
        label: typeof key0 === "string" ? key0 : "query",
      });
    },
  }),
  mutationCache: new MutationCache({
    onError(error) {
      reportError({
        source: "mutation",
        error,
        label: "mutation",
      });
    },
  }),
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
