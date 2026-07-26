import { config } from "@shared/config";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

type ActorIdProvider = () => string | null;

let actorIdProvider: ActorIdProvider = () => null;

/** Wired from `app` so shared stays free of entity imports (FSD). */
export function setActorIdProvider(provider: ActorIdProvider) {
  actorIdProvider = provider;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T }> {
  const actorId = actorIdProvider();
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(actorId ? { "X-Actor-Id": actorId } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }

  return { status: res.status, data };
}
