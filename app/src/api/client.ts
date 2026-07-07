import { apiUrl } from './config';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokenStorage';
import type { AuthResponse } from '@/types/api';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Registered by the auth store so the client can force a logout when the
 * refresh token itself is rejected. Avoids a circular import between
 * client.ts (network layer) and the Zustand auth store (app state layer).
 */
let onAuthExpired: (() => void) | null = null;
export function registerAuthExpiredHandler(handler: () => void): void {
  onAuthExpired = handler;
}

const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

let refreshPromise: Promise<string | null> | null = null;

/** Exchanges the stored refresh token for a new token pair. De-duped across concurrent 401s. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await clearTokens();
        onAuthExpired?.();
        return null;
      }
      const data = (await res.json()) as AuthResponse;
      await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Pre-built FormData for multipart uploads; takes precedence over `body`. */
  formData?: FormData;
  /** Skip attaching the Authorization header (e.g. login/register). */
  skipAuth?: boolean;
  signal?: AbortSignal;
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function doFetch(path: string, options: RequestOptions, accessToken: string | null) {
  const headers: Record<string, string> = {};
  if (!options.formData) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken && !options.skipAuth) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
  });
}

/**
 * Core typed request function. Attaches the stored access token, and on a 401
 * (for non-public routes) transparently refreshes the token once and retries.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const skipAuth = options.skipAuth ?? isPublicPath(path);
  let accessToken = skipAuth ? null : await getAccessToken();

  let res = await doFetch(path, { ...options, skipAuth }, accessToken);

  if (res.status === 401 && !skipAuth) {
    accessToken = await refreshAccessToken();
    if (accessToken) {
      res = await doFetch(path, { ...options, skipAuth }, accessToken);
    }
  }

  if (!res.ok) {
    const body = await parseResponseBody(res);
    const message =
      (typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message?: unknown }).message)
        : undefined) ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await parseResponseBody(res)) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
