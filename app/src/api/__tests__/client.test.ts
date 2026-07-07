import { apiRequest, ApiError, registerAuthExpiredHandler } from '../client';
import * as tokenStorage from '../tokenStorage';

jest.mock('../tokenStorage', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

const mockedTokenStorage = tokenStorage as jest.Mocked<typeof tokenStorage>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    // `apiRequest` parses error/success bodies via `.text()`, but
    // `refreshAccessToken` reads the `/auth/refresh` response via `.json()` —
    // both need to work off the same mocked body.
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('apiRequest error message mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('takes ApiError.message from a `{ error }` response body, not `message`', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'Invalid email or password' }));

    await expect(apiRequest('/auth/login', { skipAuth: true })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid email or password',
    });
  });

  it('falls back to `message` and then a generic status message when `error` is absent', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(500, { message: 'legacy shape' }));
    await expect(apiRequest('/x', { skipAuth: true })).rejects.toMatchObject({ message: 'legacy shape' });

    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(502, {}));
    await expect(apiRequest('/x', { skipAuth: true })).rejects.toMatchObject({
      message: 'Request failed with status 502',
    });
  });

  it('prefers `error` over `message` when a body somehow has both', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(409, { error: 'Email already registered', message: 'generic' }));

    await expect(apiRequest('/auth/register', { skipAuth: true })).rejects.toMatchObject({
      message: 'Email already registered',
    });
  });
});

describe('apiRequest 401 handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes the access token once on a 401 and retries the original request', async () => {
    mockedTokenStorage.getAccessToken.mockResolvedValue('expired-token');
    mockedTokenStorage.getRefreshToken.mockResolvedValue('a-refresh-token');
    mockedTokenStorage.saveTokens.mockResolvedValue(undefined);

    const fetchMock = jest
      .fn()
      // 1. initial request, rejected as expired
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      // 2. POST /auth/refresh succeeds with a fresh token pair
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: { id: 'u1', email: 'a@b.com' },
          accessToken: 'new-token',
          refreshToken: 'new-refresh-token',
        }),
      )
      // 3. retried original request, now authorized
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    globalThis.fetch = fetchMock;

    const result = await apiRequest('/progress');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockedTokenStorage.saveTokens).toHaveBeenCalledWith({
      accessToken: 'new-token',
      refreshToken: 'new-refresh-token',
    });

    const retryHeaders = (fetchMock.mock.calls[2]?.[1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-token');
  });

  it('logs the user out (clears tokens + fires the auth-expired handler) when there is no refresh token', async () => {
    mockedTokenStorage.getAccessToken.mockResolvedValue('expired-token');
    mockedTokenStorage.getRefreshToken.mockResolvedValue(null);
    mockedTokenStorage.clearTokens.mockResolvedValue(undefined);

    const onAuthExpired = jest.fn();
    registerAuthExpiredHandler(onAuthExpired);

    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
    globalThis.fetch = fetchMock;

    await expect(apiRequest('/progress')).rejects.toBeInstanceOf(ApiError);

    // Only the original (failed) request should have been made — no refresh
    // call to attempt, since there was nothing to refresh with.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockedTokenStorage.clearTokens).toHaveBeenCalledTimes(1);
    expect(onAuthExpired).toHaveBeenCalledTimes(1);

    registerAuthExpiredHandler(() => undefined);
  });

  it('logs the user out when the stored refresh token is itself rejected by the server', async () => {
    mockedTokenStorage.getAccessToken.mockResolvedValue('expired-token');
    mockedTokenStorage.getRefreshToken.mockResolvedValue('a-stale-refresh-token');
    mockedTokenStorage.clearTokens.mockResolvedValue(undefined);

    const onAuthExpired = jest.fn();
    registerAuthExpiredHandler(onAuthExpired);

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Refresh token expired' }));
    globalThis.fetch = fetchMock;

    await expect(apiRequest('/progress')).rejects.toBeInstanceOf(ApiError);

    expect(mockedTokenStorage.clearTokens).toHaveBeenCalledTimes(1);
    expect(onAuthExpired).toHaveBeenCalledTimes(1);

    registerAuthExpiredHandler(() => undefined);
  });
});
