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

let actorIdProvider: ActorIdProvider = () => null;

/** Wired from `app` so shared stays free of entity imports (FSD). */
export function setActorIdProvider(provider: ActorIdProvider) {
  actorIdProvider = provider;
}

export type ApiFetchInit = RequestInit & {
  /** Override ambient correlation; defaults to context or a fresh id. */
  correlationId?: string;
};

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit,
): Promise<{ status: number; data: T; correlationId: string }> {
  const actorId = actorIdProvider();
  const correlationId =
    init?.correlationId ?? getCorrelationId() ?? mintCorrelationId("http");

  const { correlationId: _drop, headers: initHeaders, ...rest } = init ?? {};

  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": correlationId,
        ...(actorId ? { "X-Actor-Id": actorId } : {}),
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
