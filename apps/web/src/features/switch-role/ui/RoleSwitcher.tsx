import { DEV_ACTORS, useActor, useSetActorById } from "@entities/user";

export function RoleSwitcher() {
  const actor = useActor();
  const setActorById = useSetActorById();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Act as</span>
      <select
        value={actor.id}
        onChange={(e) => setActorById(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
        aria-label="Switch active role"
      >
        {DEV_ACTORS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName} ({a.role})
          </option>
        ))}
      </select>
    </label>
  );
}
