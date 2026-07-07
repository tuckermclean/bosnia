import Constants from 'expo-constants';

/**
 * Backend API base URL. Resolution order:
 * 1. `EXPO_PUBLIC_API_BASE_URL` env var (inlined at build time by Expo).
 * 2. `expo.extra.apiBaseUrl` in app.json.
 * 3. `http://localhost:3000` fallback for local dev.
 */
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;

  const fromConfig = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;

  return 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_PREFIX = '/api';

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${API_PREFIX}${normalized}`;
}
