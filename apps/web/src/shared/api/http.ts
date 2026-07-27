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

/** Failed fetch / no HTTP response (DevTools Offline, DNS, etc.). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 0) return true;
  if (err instanceof TypeError) return true;
  return false;
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
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(actorId ? { "X-Actor-Id": actorId } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(0, {
      error: "network_error",
      message: err instanceof Error ? err.message : "Failed to fetch",
    });
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }

  return { status: res.status, data };
}
