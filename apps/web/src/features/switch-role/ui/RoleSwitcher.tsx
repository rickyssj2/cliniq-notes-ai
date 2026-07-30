import { useEffect, useRef, useState } from "react";
import { DEV_ACTORS, useActor, useSetActorById, ActorAvatar } from "@entities/user";

/** Avatar menu — pick who to “Act as” without dumping name/role in the chrome. */
export function RoleSwitcher() {
  const actor = useActor();
  const setActorById = useSetActorById();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        aria-label={`Act as ${actor.displayName} (${actor.role}). Change actor`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <ActorAvatar user={actor} size="md" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Switch active actor"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-(--border) bg-(--card) py-1 shadow-lg"
        >
          {DEV_ACTORS.map((a) => {
            const selected = a.id === actor.id;
            return (
              <li key={a.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100 ${
                    selected ? "bg-teal-50" : ""
                  }`}
                  onClick={() => {
                    setActorById(a.id);
                    setOpen(false);
                  }}
                >
                  <ActorAvatar user={a} size="sm" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block font-medium">{a.displayName}</span>
                    <span className="block text-xs text-(--muted)">
                      {a.role}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
