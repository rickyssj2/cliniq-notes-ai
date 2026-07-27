import { diffWords } from "diff";

type Props = {
  before: string;
  after: string;
  mode: "added" | "removed" | "both";
};

/** Word-level highlight of `after` relative to `before`. */
export function WordDiff({ before, after, mode }: Props) {
  const parts = diffWords(before, after);
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">
      {parts.map((part, i) => {
        if (part.added && (mode === "added" || mode === "both")) {
          return (
            <mark
              key={i}
              className="rounded-sm bg-emerald-200/80 text-[var(--foreground)]"
            >
              {part.value}
            </mark>
          );
        }
        if (part.removed && (mode === "removed" || mode === "both")) {
          return (
            <mark
              key={i}
              className="rounded-sm bg-rose-200/80 text-[var(--foreground)] line-through"
            >
              {part.value}
            </mark>
          );
        }
        if (part.removed) return null;
        return <span key={i}>{part.value}</span>;
      })}
    </pre>
  );
}
