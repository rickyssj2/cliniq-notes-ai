import { config } from "@shared/config";
import {
  getCorrelationId,
  mintCorrelationId,
} from "@shared/correlation";

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
type AccessTokenProvider = () => string | null;

let actorIdProvider: ActorIdProvider = () => null;
let accessTokenProvider: AccessTokenProvider = () => null;

/** Wired from `app` so shared stays free of entity imports (FSD). */
export function setActorIdProvider(provider: ActorIdProvider) {
  actorIdProvider = provider;
}

export function setAccessTokenProvider(provider: AccessTokenProvider) {
  accessTokenProvider = provider;
}

/** Current session actor id (null until providers wire `setActorIdProvider`). */
export function getActorId(): string | null {
  return actorIdProvider();
}

export function getAccessToken(): string | null {
  return accessTokenProvider();
}

export type ApiFetchInit = RequestInit & {
  /** Override ambient correlation; defaults to context or a fresh id. */
  correlationId?: string;
  /** Skip Bearer (rare; prefer raw fetch for `/dev/token`). */
  skipAuth?: boolean;
};

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit,
): Promise<{ status: number; data: T; correlationId: string }> {
  const actorId = actorIdProvider();
  const accessToken = accessTokenProvider();
  const correlationId =
    init?.correlationId ?? getCorrelationId() ?? mintCorrelationId("http");

  const {
    correlationId: _drop,
    skipAuth,
    headers: initHeaders,
    ...rest
  } = init ?? {};

  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": correlationId,
        // Legacy header kept for debugging; server ignores it for authz.
        ...(actorId ? { "X-Actor-Id": actorId } : {}),
        ...(!skipAuth && accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}),
        ...(initHeaders ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(0, {
      error: "network_error",
      message: err instanceof Error ? err.message : "Failed to fetch",
      correlationId,
    });
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }

  return { status: res.status, data, correlationId };
}
