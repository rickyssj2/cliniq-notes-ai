import { useMemo, useState, type ReactNode } from "react";
import type { SoapSection, VersionConflictError } from "@soulside/domain";
import type { EditorDraft } from "@entities/note";
import { Button } from "@shared/ui/button";
import { WordDiff } from "../lib/word-diff";

const SECTIONS: SoapSection[] = ["S", "O", "A", "P"];
const LABELS: Record<SoapSection, string> = {
  S: "Subjective",
  O: "Objective",
  A: "Assessment",
  P: "Plan",
};

type Choice = "yours" | "server" | "ancestor";

type Props = {
  conflict: VersionConflictError;
  yours: EditorDraft;
  onCancel: () => void;
  onResolve: (sections: Record<SoapSection, string>, baseVersionId: string) => void;
};

export function ConflictMergeModal({
  conflict,
  yours,
  onCancel,
  onResolve,
}: Props) {
  const [choices, setChoices] = useState<Record<SoapSection, Choice>>({
    S: "yours",
    O: "yours",
    A: "yours",
    P: "yours",
  });
  const [active, setActive] = useState<SoapSection>("S");

  const merged = useMemo(() => {
    const out = {} as Record<SoapSection, string>;
    for (const s of SECTIONS) {
      const c = choices[s];
      if (c === "yours") out[s] = yours.sections[s];
      else if (c === "server") out[s] = conflict.current.content.sections[s];
      else out[s] = conflict.commonAncestor.content.sections[s];
    }
    return out;
  }, [choices, conflict, yours.sections]);

  const ancestor = conflict.commonAncestor.content.sections[active];
  const yoursText = yours.sections[active];
  const serverText = conflict.current.content.sections[active];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
        <header className="border-b border-[var(--border)] px-5 py-4">
          <h2 id="conflict-title" className="text-lg font-semibold">
            Version conflict
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Server advanced to rev {conflict.current.revision} while you edited
            from a stale base. Pick per section, then save against the new head.
          </p>
        </header>

        <div className="flex gap-2 border-b border-[var(--border)] px-5 py-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActive(s)}
              className={`rounded px-3 py-1 text-sm ${
                active === s
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--border)]"
              }`}
            >
              {s} · {LABELS[s]}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-5 md:grid-cols-3">
          <Column title="Common ancestor" subtitle={`rev ${conflict.commonAncestor.revision}`}>
            <pre className="whitespace-pre-wrap break-words font-sans text-xs">
              {ancestor}
            </pre>
          </Column>
          <Column
            title="Yours"
            subtitle="local draft"
            selected={choices[active] === "yours"}
            onSelect={() =>
              setChoices((c) => ({ ...c, [active]: "yours" }))
            }
          >
            <WordDiff before={ancestor} after={yoursText} mode="both" />
          </Column>
          <Column
            title="Server head"
            subtitle={`${conflict.current.authoredBy.displayName} · rev ${conflict.current.revision}`}
            selected={choices[active] === "server"}
            onSelect={() =>
              setChoices((c) => ({ ...c, [active]: "server" }))
            }
          >
            <WordDiff before={ancestor} after={serverText} mode="both" />
          </Column>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            {SECTIONS.map((s) => (
              <span key={s} className="rounded border border-[var(--border)] px-2 py-1">
                {s}: {choices[s]}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Keep editing
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setChoices({ S: "server", O: "server", A: "server", P: "server" })
              }
            >
              Take all server
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onResolve(merged, conflict.current.id)}
            >
              Resolve & save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({
  title,
  subtitle,
  children,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-md border p-3 ${
        selected
          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        {onSelect && (
          <Button type="button" size="sm" variant="outline" onClick={onSelect}>
            Use
          </Button>
        )}
      </div>
      <div className="min-h-[8rem] flex-1 overflow-auto rounded bg-[var(--background)] p-2">
        {children}
      </div>
    </div>
  );
}
