import { useEffect, useMemo, useState } from "react";
import type { NoteDetail, SoapSection } from "@soulside/domain";
import { useNoteVersionQuery } from "@entities/note";
import { WordDiff } from "@shared/ui/word-diff";
import { cn } from "@shared/lib";

const SECTIONS: Array<{ key: SoapSection; label: string }> = [
  { key: "S", label: "Subjective" },
  { key: "O", label: "Objective" },
  { key: "A", label: "Assessment" },
  { key: "P", label: "Plan" },
];

type VersionMeta = NoteDetail["versions"][number];

type Props = {
  note: NoteDetail;
  /** Narrow column layout for note-detail sidebars. */
  variant?: "page" | "sidebar";
};

/**
 * Pick up to two versions from the sidebar → word-level SOAP diff.
 * First click = base (older), second = compare (newer); third resets.
 */
export function NoteHistoryPanel({ note, variant = "page" }: Props) {
  const sidebar = variant === "sidebar";
  const versions = useMemo(
    () => [...note.versions].sort((a, b) => b.revision - a.revision),
    [note.versions],
  );
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  useEffect(() => {
    setLeftId(null);
    setRightId(null);
  }, [note.id]);

  const onPick = (id: string) => {
    if (leftId === id) {
      setLeftId(rightId);
      setRightId(null);
      return;
    }
    if (rightId === id) {
      setRightId(null);
      return;
    }
    if (!leftId) {
      setLeftId(id);
      return;
    }
    if (!rightId) {
      setRightId(id);
      return;
    }
    setLeftId(id);
    setRightId(null);
  };

  const leftMeta = versions.find((v) => v.id === leftId) ?? null;
  const rightMeta = versions.find((v) => v.id === rightId) ?? null;

  // Normalize so diff is older → newer when both selected
  const ordered = useMemo(() => {
    if (!leftMeta || !rightMeta) {
      return { base: leftMeta, head: rightMeta };
    }
    if (leftMeta.revision <= rightMeta.revision) {
      return { base: leftMeta, head: rightMeta };
    }
    return { base: rightMeta, head: leftMeta };
  }, [leftMeta, rightMeta]);

  const baseQ = useNoteVersionQuery(note.id, ordered.base?.id ?? null);
  const headQ = useNoteVersionQuery(note.id, ordered.head?.id ?? null);

  return (
    <section
      className={
        sidebar
          ? "flex h-full min-h-0 flex-col gap-3"
          : "space-y-4 rounded-lg border border-(--border) bg-(--card) p-4"
      }
    >
      <div className={sidebar ? "shrink-0" : undefined}>
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Version history
        </h2>
        <p className="mt-1 text-xs text-(--muted)">
          Select two revisions to diff SOAP (word-level).
        </p>
      </div>

      <div
        className={
          sidebar
            ? "flex min-h-0 flex-1 flex-col gap-3"
            : "grid gap-4 lg:grid-cols-[14rem_1fr]"
        }
      >
        <ul
          className={
            sidebar
              ? "max-h-48 shrink-0 space-y-1 overflow-auto rounded border border-(--border) p-2"
              : "max-h-72 space-y-1 overflow-auto rounded border border-(--border) p-2"
          }
        >
          {versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              isCurrent={v.id === note.currentVersion.id}
              selected={
                v.id === leftId ? "A" : v.id === rightId ? "B" : null
              }
              onPick={() => onPick(v.id)}
            />
          ))}
          {versions.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-(--muted)">
              No versions yet
            </li>
          )}
        </ul>

        <div
          className={
            sidebar
              ? "min-h-0 flex-1 overflow-auto"
              : "min-h-[12rem]"
          }
        >
          {!ordered.base || !ordered.head ? (
            <div className="flex h-full min-h-[6rem] items-center justify-center rounded border border-dashed border-(--border) px-3 py-6 text-center text-xs text-(--muted)">
              {leftId
                ? "Pick a second revision"
                : "Pick two revisions"}
            </div>
          ) : baseQ.isLoading || headQ.isLoading ? (
            <div className="animate-pulse space-y-2 p-2">
              <div className="h-4 w-40 rounded bg-stone-200" />
              <div className="h-24 rounded bg-stone-200" />
            </div>
          ) : baseQ.isError || headQ.isError || !baseQ.data || !headQ.data ? (
            <p className="text-sm text-(--danger)">
              Couldn’t load version content
              {!navigator.onLine ? " (offline — open while online first)" : ""}.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-(--muted)">
                Rev {ordered.base.revision} → {ordered.head.revision}
                {" · "}
                <span className="text-rose-700">−</span>
                {" / "}
                <span className="text-emerald-800">+</span>
              </p>
              {SECTIONS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <p className="text-xs font-semibold tracking-wide uppercase">
                    {key} · {label}
                  </p>
                  <div className="rounded border border-(--border) bg-(--background) p-2">
                    <WordDiff
                      before={baseQ.data.content.sections[key]}
                      after={headQ.data.content.sections[key]}
                      mode="both"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function VersionRow({
  version,
  isCurrent,
  selected,
  onPick,
}: {
  version: VersionMeta;
  isCurrent: boolean;
  selected: "A" | "B" | null;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
          selected
            ? "bg-teal-50 ring-1 ring-teal-600/40"
            : "hover:bg-stone-100",
        )}
      >
        <span className="flex items-center justify-between gap-2 font-medium">
          <span>
            Rev {version.revision}
            {isCurrent ? " · head" : ""}
          </span>
          {selected && (
            <span className="rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {selected}
            </span>
          )}
        </span>
        <span className="truncate text-(--muted)">
          {version.authoredBy.displayName}
        </span>
        <span className="text-[10px] text-(--muted)">
          {new Date(version.createdAt).toLocaleString()}
        </span>
      </button>
    </li>
  );
}
