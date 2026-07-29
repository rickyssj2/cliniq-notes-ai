import type { SoapSection } from "@soulside/domain";
import { useEditorDraftStore } from "@entities/note";
import { cn } from "@shared/lib";

const SECTIONS: Array<{ key: SoapSection; label: string }> = [
  { key: "S", label: "Subjective" },
  { key: "O", label: "Objective" },
  { key: "A", label: "Assessment" },
  { key: "P", label: "Plan" },
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
      {SECTIONS.map(({ key, label }) => {
        const dirty = draft.dirty[key];
        return (
          <label key={key} className="block space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-teal-50 text-xs font-semibold text-teal-900">
                {key}
              </span>
              {label}
              {dirty && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
                  Dirty
                </span>
              )}
            </span>
            <textarea
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
