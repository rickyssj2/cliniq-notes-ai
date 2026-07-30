import { useActor } from "../model/session";

export function SessionBadge() {
  const actor = useActor();
  return (
    <div className="text-right text-xs leading-tight">
      <p className="font-medium text-(--foreground)">{actor.displayName}</p>
      <p className="text-(--muted)">
        <code>{actor.id}</code> · {actor.role}
      </p>
    </div>
  );
}
