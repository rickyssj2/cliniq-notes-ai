import type { PresenceViewer } from "@entities/note";
import { ActorAvatar } from "@entities/user";
import { cn } from "@shared/lib";

type Props = {
  viewers: PresenceViewer[];
  /** Hide this user id (usually self). */
  excludeUserId?: string;
  max?: number;
  className?: string;
};

export function PresenceAvatars({
  viewers,
  excludeUserId,
  max = 4,
  className,
}: Props) {
  const filtered = viewers.filter((v) => v.id !== excludeUserId);
  // Presence is per-socket; same user in multiple tabs → duplicate ids. One avatar each.
  const unique = [...new Map(filtered.map((v) => [v.id, v])).values()];
  if (unique.length === 0) return null;

  const shown = unique.slice(0, max);
  const overflow = unique.length - shown.length;

  return (
    <div
      className={cn("flex items-center -space-x-1.5", className)}
      title={unique.map((v) => v.displayName).join(", ")}
    >
      {shown.map((v) => (
        <ActorAvatar key={v.id} user={v} size="sm" />
      ))}
      {overflow > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-stone-500 text-[9px] font-semibold text-white">
          +{overflow}
        </span>
      )}
    </div>
  );
}
