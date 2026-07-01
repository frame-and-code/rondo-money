import { API_BASE_URL } from './config';

/** A non-2xx response from the API, carrying its HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Minimal JSON fetch against the API. Intentionally tiny — the real, typed client is
 * generated from the OpenAPI spec in F1 (ADR-002), so this only needs to prove the
 * env-driven base URL is wired up and unblock any early server-side reads.
 *
 * @param path - API path, resolved against {@link API_BASE_URL} (e.g. `/health`).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    throw new ApiError(res.status, `API request to ${path} failed with ${res.status}`);
  }

  return res.json() as Promise<T>;
}
