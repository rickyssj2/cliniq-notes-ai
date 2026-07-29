import { useQuery } from "@tanstack/react-query";
import { fetchDevUsers } from "./notes-api";
import { notesQueryKeys } from "./query-keys";

/** Seeded actor directory for filters — nearly static for the take-home. */
export function useDevUsersQuery() {
  return useQuery({
    queryKey: notesQueryKeys.devUsers(),
    queryFn: fetchDevUsers,
    staleTime: Infinity,
  });
}
