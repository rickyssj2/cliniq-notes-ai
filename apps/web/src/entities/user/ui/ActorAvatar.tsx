import type { UserRef } from "@soulside/domain";
import { cn } from "@shared/lib";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

const SIZE = {
  sm: "h-6 w-6 text-[9px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-9 w-9 text-xs",
} as const;

type Props = {
  user: Pick<UserRef, "displayName" | "id">;
  size?: keyof typeof SIZE;
  className?: string;
  title?: string;
};

/** Initials avatar — shared by presence chips and the session switcher. */
export function ActorAvatar({
  user,
  size = "md",
  className,
  title,
}: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-white bg-teal-700 font-semibold text-white",
        SIZE[size],
        className,
      )}
      title={title ?? user.displayName}
      aria-label={user.displayName}
    >
      {initials(user.displayName)}
    </span>
  );
}
