import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useLocation } from "react-router";
import type { NoteSummary } from "@soulside/domain";
import {
  NoteStatusBadge,
  useNoteSelectionStore,
  usePresenceStore,
  EMPTY_PRESENCE,
} from "@entities/note";
import type { NotesSortField } from "@entities/note";
import { useActor } from "@entities/user";
import {
  PresenceAvatars,
  useRealtimeNoteSource,
} from "@features/realtime-sync";
import { cn } from "@shared/lib";

const ROW_HEIGHT = 52;

type Props = {
  notes: NoteSummary[];
  total: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  sort: NotesSortField;
  order: "asc" | "desc";
  onToggleSort: (field: NotesSortField) => void;
  emptyMode: "loading" | "empty" | "no-results" | "offline" | "ready";
};

function SortHeader({
  label,
  field,
  active,
  order,
  onToggle,
  className,
}: {
  label: string;
  field: NotesSortField;
  active: boolean;
  order: "asc" | "desc";
  onToggle: (field: NotesSortField) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={cn(
        "text-left text-xs font-semibold tracking-wide text-(--muted) uppercase",
        className,
      )}
    >
      {label}
      {active ? (order === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

export function NotesTable({
  notes,
  total,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  sort,
  order,
  onToggleSort,
  emptyMode,
}: Props) {
  const location = useLocation();
  const actor = useActor();
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedIds = useNoteSelectionStore((s) => s.selectedIds);
  const toggle = useNoteSelectionStore((s) => s.toggle);
  const setMany = useNoteSelectionStore((s) => s.setMany);
  const presenceByNote = usePresenceStore((s) => s.byNoteId);

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const visibleIds = useMemo(
    () => virtualItems.map((row) => notes[row.index]?.id).filter(Boolean) as string[],
    [virtualItems, notes],
  );
  useRealtimeNoteSource("viewport", visibleIds);

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= notes.length - 10 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [
    virtualItems,
    notes.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const allVisibleSelected =
    notes.length > 0 && notes.every((n) => selectedIds.has(n.id));

  if (emptyMode === "loading" || (isLoading && notes.length === 0)) {
    return (
      <div className="space-y-2 rounded-lg border border-(--border) bg-(--card) p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md bg-stone-200/70"
          />
        ))}
      </div>
    );
  }

  if (emptyMode === "empty") {
    return (
      <div className="rounded-lg border border-dashed border-(--border) bg-(--card) px-6 py-16 text-center">
        <p className="font-medium">No notes in the workspace yet</p>
        <p className="mt-2 text-sm text-(--muted)">
          Empty dataset — restart the API (auto-seeds 100k) or set{" "}
          <code>SEED_COUNT</code>, then come back.
        </p>
      </div>
    );
  }

  if (emptyMode === "offline") {
    return (
      <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-6 py-16 text-center">
        <p className="font-medium text-amber-950">You’re offline</p>
        <p className="mt-2 text-sm text-amber-900/80">
          No notes are cached for these filters. Browse the list while online
          first — loaded pages stay available offline for ~35 minutes.
        </p>
      </div>
    );
  }

  if (emptyMode === "no-results") {
    return (
      <div className="rounded-lg border border-dashed border-(--border) bg-(--card) px-6 py-16 text-center">
        <p className="font-medium">No notes match these filters</p>
        <p className="mt-2 text-sm text-(--muted)">
          Distinct from an empty workspace — try clearing filters or search.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-(--border) bg-(--card)">
      <div className="grid grid-cols-[2.5rem_1.2fr_1fr_1fr_1fr_7rem] gap-2 border-b border-(--border) bg-stone-50 px-3 py-2">
        <label className="relative flex items-center justify-center">
          <span className="sr-only">Select all loaded notes</span>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e) =>
              setMany(
                notes.map((n) => n.id),
                e.target.checked,
              )
            }
          />
        </label>
        <span className="text-xs font-semibold tracking-wide text-(--muted) uppercase">
          Patient
        </span>
        <SortHeader
          label="Status"
          field="status"
          active={sort === "status"}
          order={order}
          onToggle={onToggleSort}
        />
        <span className="text-xs font-semibold tracking-wide text-(--muted) uppercase">
          Reviewer
        </span>
        <SortHeader
          label="Updated"
          field="updatedAt"
          active={sort === "updatedAt"}
          order={order}
          onToggle={onToggleSort}
        />
        <SortHeader
          label="Created"
          field="createdAt"
          active={sort === "createdAt"}
          order={order}
          onToggle={onToggleSort}
        />
      </div>

      <div ref={parentRef} className="h-[min(70vh,720px)] overflow-auto">
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualItems.map((row) => {
            const note = notes[row.index]!;
            const selected = selectedIds.has(note.id);
            return (
              <div
                key={note.id}
                data-note-row
                tabIndex={0}
                className={cn(
                  "absolute left-0 grid w-full grid-cols-[2.5rem_1.2fr_1fr_1fr_1fr_7rem] items-center gap-2 border-b border-(--border)/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-inset",
                  selected && "bg-teal-50/60",
                )}
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <label className="relative flex items-center justify-center">
                  <span className="sr-only">
                    Select {note.patient.displayName}
                  </span>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(note.id)}
                  />
                </label>
                <div className="min-w-0">
                  <Link
                    to={{
                      pathname: `/notes/${note.id}`,
                      search: location.search,
                    }}
                    className="block truncate font-medium text-(--foreground) hover:text-(--accent)"
                  >
                    {note.patient.displayName}
                  </Link>
                  <p className="truncate text-xs text-(--muted)">{note.id}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <NoteStatusBadge status={note.status} />
                    <PresenceAvatars
                      viewers={presenceByNote[note.id] ?? EMPTY_PRESENCE}
                      excludeUserId={actor.id}
                      max={3}
                    />
                  </div>
                </div>
                <p className="truncate text-(--muted)">
                  {note.assignedReviewer?.displayName ?? "—"}
                </p>
                <p className="truncate text-xs text-(--muted)">
                  {new Date(note.updatedAt).toLocaleString()}
                </p>
                <p className="truncate text-xs text-(--muted)">
                  {new Date(note.createdAt).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-(--border) px-3 py-2 text-xs text-(--muted)">
        <span>
          Showing {notes.length} loaded / {total} matching
        </span>
        <span>
          {isFetchingNextPage
            ? "Loading more…"
            : hasNextPage
              ? "Scroll for more"
              : "End of list"}
        </span>
      </div>
    </div>
  );
}
