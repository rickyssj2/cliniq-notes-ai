import { cn } from "@shared/lib";
import type { NoteStatus } from "@soulside/domain";

const STYLES: Record<NoteStatus, string> = {
  GENERATING: "bg-amber-50 text-amber-900 border-amber-200",
  READY_FOR_REVIEW: "bg-sky-50 text-sky-900 border-sky-200",
  IN_REVIEW: "bg-indigo-50 text-indigo-900 border-indigo-200",
  APPROVED: "bg-emerald-50 text-emerald-900 border-emerald-200",
  LOCKED: "bg-stone-100 text-stone-700 border-stone-300",
  FAILED: "bg-red-50 text-red-900 border-red-200",
  REJECTED: "bg-orange-50 text-orange-900 border-orange-200",
  AMENDED: "bg-violet-50 text-violet-900 border-violet-200",
};

export function NoteStatusBadge({ status }: { status: NoteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
