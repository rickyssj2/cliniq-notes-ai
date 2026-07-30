import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useLocation } from "react-router";
import type { NoteSummary } from "@soulside/domain";
import {
  NoteStatusBadge,
  useNoteSelectionStore,
  usePresenceStore,
  EMPTY_PRESENCE,
  NOTES_LIST_MAX_PAGES,
  NOTES_PAGE_SIZE,
} from "@entities/note";
import type { NotesSortField } from "@entities/note";
import { useActor } from "@entities/user";
import {
  PresenceAvatars,
  useRealtimeNoteSource,
} from "@features/realtime-sync";
import { cn } from "@shared/lib";

const ROW_HEIGHT = 52;
/** Fetch when within this many rows of either edge of the loaded window. */
const EDGE_FETCH_ROWS = 10;

type Props = {
  notes: NoteSummary[];
  /** Absolute end index of the current window (offset + length). */
  loadedThrough: number;
  total: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  fetchNextPage: () => void;
  fetchPreviousPage: () => void;
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

type ScrollAnchor = { id: string | null; offsetInRow: number };

function captureScrollAnchor(
  el: HTMLDivElement,
  list: NoteSummary[],
): ScrollAnchor {
  if (list.length === 0) return { id: null, offsetInRow: 0 };
  const idx = Math.min(
    list.length - 1,
    Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT)),
  );
  return {
    id: list[idx]?.id ?? null,
    offsetInRow: el.scrollTop - idx * ROW_HEIGHT,
  };
}

/**
 * Keep the viewport pinned to the same note when the sliding window
 * prepends / front-trims. Anchor is refreshed on every user scroll —
 * snapshooting only on `notes` changes leaves it stuck on an early row and
 * restores scrollTop to ~0 after each fetch.
 */
function useWindowScrollAnchor(
  parentRef: RefObject<HTMLDivElement | null>,
  notes: NoteSummary[],
  suppressScrollRef: MutableRefObject<boolean>,
  anchorRef: MutableRefObject<ScrollAnchor>,
) {
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const { id, offsetInRow } = anchorRef.current;
    if (id) {
      const newIndex = notes.findIndex((n) => n.id === id);
      if (newIndex >= 0) {
        const nextTop = newIndex * ROW_HEIGHT + offsetInRow;
        if (Math.abs(el.scrollTop - nextTop) > 0.5) {
          suppressScrollRef.current = true;
          el.scrollTop = nextTop;
          requestAnimationFrame(() => {
            suppressScrollRef.current = false;
          });
        }
      }
    }

    anchorRef.current = captureScrollAnchor(el, notes);
  }, [notes, parentRef, suppressScrollRef, anchorRef]);

  return notesRef;
}

export function NotesTable({
  notes,
  loadedThrough,
  total,
  isLoading,
  isFetchingNextPage,
  isFetchingPreviousPage,
  hasNextPage,
  hasPreviousPage,
  fetchNextPage,
  fetchPreviousPage,
  sort,
  order,
  onToggleSort,
  emptyMode,
}: Props) {
  const location = useLocation();
  const actor = useActor();
  const parentRef = useRef<HTMLDivElement>(null);
  const suppressScrollRef = useRef(false);
  const anchorRef = useRef<ScrollAnchor>({ id: null, offsetInRow: 0 });
  const selectedIds = useNoteSelectionStore((s) => s.selectedIds);
  const toggle = useNoteSelectionStore((s) => s.toggle);
  const setMany = useNoteSelectionStore((s) => s.setMany);
  const presenceByNote = usePresenceStore((s) => s.byNoteId);

  const notesRef = useWindowScrollAnchor(
    parentRef,
    notes,
    suppressScrollRef,
    anchorRef,
  );

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const visibleIds = useMemo(
    () =>
      virtualItems
        .map((row) => notes[row.index]?.id)
        .filter(Boolean) as string[],
    [virtualItems, notes],
  );
  useRealtimeNoteSource("viewport", visibleIds);

  // Refresh the scroll anchor while scrolling; only fetch when the user
  // moves toward an edge (ignore programmatic anchor corrections).
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    let lastScrollTop = el.scrollTop;

    const onScroll = () => {
      if (suppressScrollRef.current) {
        lastScrollTop = el.scrollTop;
        return;
      }

      const top = el.scrollTop;
      const dy = top - lastScrollTop;
      lastScrollTop = top;

      anchorRef.current = captureScrollAnchor(el, notesRef.current);

      if (dy === 0) return;

      const items = virtualizer.getVirtualItems();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      const count = notesRef.current.length;

      if (
        dy > 0 &&
        last.index >= count - EDGE_FETCH_ROWS &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }

      if (
        dy < 0 &&
        first.index <= EDGE_FETCH_ROWS &&
        hasPreviousPage &&
        !isFetchingPreviousPage
      ) {
        fetchPreviousPage();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [
    virtualizer,
    notesRef,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage,
    isFetchingPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
  ]);

  const allVisibleSelected =
    notes.length > 0 && notes.every((n) => selectedIds.has(n.id));

  const windowCap = NOTES_LIST_MAX_PAGES * NOTES_PAGE_SIZE;

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
          first — the sliding window (~{windowCap} notes) stays available
          offline for ~35 minutes.
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

  const edgeHint = (() => {
    if (isFetchingNextPage || isFetchingPreviousPage) return "Loading more…";
    if (hasNextPage || hasPreviousPage) return "Scroll for more";
    return "End of list";
  })();

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

      <div
        ref={parentRef}
        className="h-[min(70vh,720px)] overflow-auto [overflow-anchor:none]"
      >
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
          Showing {loadedThrough.toLocaleString()} loaded /{" "}
          {total.toLocaleString()} matching ({notes.length} in memory
          {notes.length >= windowCap ? `, cap ${windowCap}` : ""})
        </span>
        <span>{edgeHint}</span>
      </div>
    </div>
  );
}
