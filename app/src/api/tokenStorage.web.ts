// Web token store (SPEC OD1). Both tokens live in localStorage: the web app is
// served from the same origin as the API, the access token is short-lived, and
// the 30-day refresh token is the real exposure; refresh-token rotation limits
// what a stolen one is worth. localStorage is read at call time, not import.

const ACCESS_TOKEN_KEY = 'ljiljan.accessToken';
const REFRESH_TOKEN_KEY = 'ljiljan.refreshToken';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
