import { config } from "@shared/config";
import type { UserRef } from "@soulside/domain";

export type MintedToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  actor: UserRef;
};

/** Mint a demo JWT for a seeded actor. Does not use apiFetch (no Bearer yet). */
export async function mintDevToken(actorId: string): Promise<MintedToken> {
  const res = await fetch(`${config.apiBaseUrl}/dev/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId }),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as MintedToken & { error?: string }) : null;
  if (!res.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : `mint token failed (${res.status})`,
    );
  }
  if (!data?.accessToken) {
    throw new Error("mint token: missing accessToken");
  }
  return data;
}
