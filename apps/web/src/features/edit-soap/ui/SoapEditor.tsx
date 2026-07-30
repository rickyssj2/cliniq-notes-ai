import type { SoapSection } from "@soulside/domain";
import { useEditorDraftStore } from "@entities/note";
import { cn } from "@shared/lib";

const SECTIONS: Array<{
  key: SoapSection;
  label: string;
  /** Chord shown in the label (platform-aware copy). */
  shortcutHint: string;
}> = [
  { key: "S", label: "Subjective", shortcutHint: "⌃S / Alt+S" },
  { key: "O", label: "Objective", shortcutHint: "⌃O / Alt+O" },
  { key: "A", label: "Assessment", shortcutHint: "⌃A / Alt+A" },
  { key: "P", label: "Plan", shortcutHint: "⌃P / Alt+P" },
];

type Props = {
  noteId: string;
  readOnly: boolean;
};

export function SoapEditor({ noteId, readOnly }: Props) {
  const draft = useEditorDraftStore((s) => s.drafts[noteId]);
  const setSection = useEditorDraftStore((s) => s.setSection);

  if (!draft) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading editor draft…</p>
    );
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map(({ key, label, shortcutHint }) => {
        const dirty = draft.dirty[key];
        return (
          <label key={key} className="block space-y-1.5">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-teal-50 text-xs font-semibold text-teal-900">
                {key}
              </span>
              {label}
              <kbd className="rounded border border-[var(--border)] bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] font-normal text-[var(--muted)]">
                {shortcutHint}
              </kbd>
              {dirty && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
                  Dirty
                </span>
              )}
            </span>
            <textarea
              id={`soap-section-${key}`}
              data-soap-section={key}
              value={draft.sections[key]}
              readOnly={readOnly}
              disabled={readOnly}
              rows={5}
              aria-label={label}
              onChange={(e) => setSection(noteId, key, e.target.value)}
              className={cn(
                "w-full resize-y rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm leading-relaxed",
                readOnly && "cursor-not-allowed bg-stone-50 text-[var(--muted)]",
                dirty && !readOnly && "border-amber-300",
              )}
            />
          </label>
        );
      })}
    </div>
  );
}
