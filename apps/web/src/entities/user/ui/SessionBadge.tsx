import { useActor } from "../model/session";

export function SessionBadge() {
  const actor = useActor();
  return (
    <div className="text-right text-xs leading-tight">
      <p className="font-medium text-[var(--foreground)]">{actor.displayName}</p>
      <p className="text-[var(--muted)]">
        <code>{actor.id}</code> · {actor.role}
      </p>
    </div>
  );
}
