import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, UserRef } from "@soulside/domain";
import { DEFAULT_ACTOR, DEV_ACTORS } from "./actors";
import { mintDevToken } from "../api/mint-token";

type SessionState = {
  actor: UserRef;
  accessToken: string | null;
  setSession: (actor: UserRef, accessToken: string) => void;
  setActorById: (id: string) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      actor: DEFAULT_ACTOR,
      accessToken: null,
      setSession: (actor, accessToken) => set({ actor, accessToken }),
      setActorById: (id) => {
        const actor = DEV_ACTORS.find((a) => a.id === id) ?? DEFAULT_ACTOR;
        set({ actor, accessToken: null });
      },
    }),
    {
      name: "soulside.session",
      partialize: (s) => ({ actor: s.actor, accessToken: s.accessToken }),
    },
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

export function useAccessToken(): string | null {
  return useSessionStore((s) => s.accessToken);
}

/**
 * Switch “Act as” actor and mint a fresh server JWT.
 * Token claims are authoritative on the API; client actor is UX + local guards.
 */
export async function switchActor(id: string): Promise<UserRef> {
  const actor = DEV_ACTORS.find((a) => a.id === id) ?? DEFAULT_ACTOR;
  const minted = await mintDevToken(actor.id);
  useSessionStore.getState().setSession(actor, minted.accessToken);
  return actor;
}

/** Ensure session has a Bearer token (remint when missing or `force`). */
export async function ensureAccessToken(opts?: {
  force?: boolean;
}): Promise<string> {
  const { actor, accessToken } = useSessionStore.getState();
  if (accessToken && !opts?.force) return accessToken;
  const minted = await mintDevToken(actor.id);
  useSessionStore.getState().setSession(actor, minted.accessToken);
  return minted.accessToken;
}
