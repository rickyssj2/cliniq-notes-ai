import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, UserRef } from "@soulside/domain";
import { DEFAULT_ACTOR, DEV_ACTORS } from "./actors";

type SessionState = {
  actor: UserRef;
  setActor: (actor: UserRef) => void;
  setActorById: (id: string) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      actor: DEFAULT_ACTOR,
      setActor: (actor) => set({ actor }),
      setActorById: (id) => {
        const actor = DEV_ACTORS.find((a) => a.id === id) ?? DEFAULT_ACTOR;
        set({ actor });
      },
    }),
    { name: "soulside.session" },
  ),
);

export function useActor(): UserRef {
  return useSessionStore((s) => s.actor);
}

export function useRole(): Role {
  return useSessionStore((s) => s.actor.role);
}

export function useSetActorById(): (id: string) => void {
  return useSessionStore((s) => s.setActorById);
}
