import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { NOTE_STATUSES, type NoteStatus } from "@soulside/domain";
import type {
  NotesFilterState,
  NotesSortField,
  NotesSortOrder,
} from "@entities/note";

function parseStatuses(raw: string | null): NoteStatus[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is NoteStatus =>
      (NOTE_STATUSES as readonly string[]).includes(s),
    );
}

function isSort(v: string | null): v is NotesSortField {
  return v === "updatedAt" || v === "createdAt" || v === "status";
}

function isOrder(v: string | null): v is NotesSortOrder {
  return v === "asc" || v === "desc";
}

export function useNotesListSearchParams() {
  const [params, setParams] = useSearchParams();

  const filters: NotesFilterState = useMemo(() => {
    const sortParam = params.get("sort");
    const orderParam = params.get("order");
    return {
      statuses: parseStatuses(params.get("status")),
      reviewerId: params.get("reviewerId") ?? "",
      patientId: params.get("patientId") ?? "",
      q: params.get("q") ?? "",
      sort: isSort(sortParam) ? sortParam : "updatedAt",
      order: isOrder(orderParam) ? orderParam : "desc",
      updatedFrom: params.get("updatedFrom") ?? "",
      updatedTo: params.get("updatedTo") ?? "",
    };
  }, [params]);

  const patch = useCallback(
    (next: Partial<NotesFilterState>) => {
      setParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          const merged = { ...filters, ...next };

          if (merged.statuses.length) sp.set("status", merged.statuses.join(","));
          else sp.delete("status");

          if (merged.reviewerId) sp.set("reviewerId", merged.reviewerId);
          else sp.delete("reviewerId");

          if (merged.patientId) sp.set("patientId", merged.patientId);
          else sp.delete("patientId");

          if (merged.q) sp.set("q", merged.q);
          else sp.delete("q");

          if (merged.sort && merged.sort !== "updatedAt") sp.set("sort", merged.sort);
          else sp.delete("sort");

          if (merged.order && merged.order !== "desc") sp.set("order", merged.order);
          else sp.delete("order");

          if (merged.updatedFrom) sp.set("updatedFrom", merged.updatedFrom);
          else sp.delete("updatedFrom");

          if (merged.updatedTo) sp.set("updatedTo", merged.updatedTo);
          else sp.delete("updatedTo");

          return sp;
        },
        { replace: true },
      );
    },
    [filters, setParams],
  );

  const hasActiveFilters = Boolean(
    filters.statuses.length ||
      filters.reviewerId ||
      filters.patientId ||
      filters.q ||
      filters.updatedFrom ||
      filters.updatedTo,
  );

  const toggleSort = useCallback(
    (field: NotesSortField) => {
      if (filters.sort === field) {
        patch({ order: filters.order === "asc" ? "desc" : "asc" });
      } else {
        patch({ sort: field, order: "desc" });
      }
    },
    [filters.order, filters.sort, patch],
  );

  return { filters, patch, hasActiveFilters, toggleSort };
}
