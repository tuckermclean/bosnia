import React from 'react';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useAuthStore } from '@/state/authStore';

// --- Mocks: no network, no real secure store. ---------------------------------
// `@/api/tokenStorage` is not mocked: the real native store runs on these jest
// functions.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// `standard-navigation` ships untranspiled ESM that jest's transform ignore list skips.
jest.mock('standard-navigation', () => ({
  createStandardNavigator: (NavigatorContent: unknown) => ({
    type: 'standard',
    version: 1,
    NavigatorContent,
  }),
}));

const SecureStore = require('expo-secure-store') as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

const user = { id: 'u1', email: 'ana@example.com' };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: jest.Mock;

function renderAuth(initialUrl: '/sign-in' | '/sign-up') {
  return renderRouter(
    {
      '(auth)/sign-in': require('../app/(auth)/sign-in').default,
      '(auth)/sign-up': require('../app/(auth)/sign-up').default,
    },
    { initialUrl },
  );
}

function sentBody(): Record<string, string> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  SecureStore.getItemAsync.mockReset().mockResolvedValue(null);
  SecureStore.setItemAsync.mockReset().mockResolvedValue(undefined);
  SecureStore.deleteItemAsync.mockReset().mockResolvedValue(undefined);
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  useAuthStore.setState({ status: 'unauthenticated', user: null, error: null });
});

// The first case loads and transforms the real route files, which is slow on a cold jest cache.
jest.setTimeout(30000);

describe('pins: A04 sign-in and sign-up forms', () => {
  it('sign in sends the email trimmed and lower-cased (A04-AC-3)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: 'a', refreshToken: 'r', user }));
    await renderAuth('/sign-in');

    await fireEvent.changeText(screen.getByTestId('email-input'), '  Ana@Example.COM ');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-pass');
    await fireEvent.press(screen.getByTestId('sign-in-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/login$/);
    expect(sentBody()).toEqual({ email: 'ana@example.com', password: 'secret-pass' });
  });

  it('sign in shows the ApiError message (A04-AC-3)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid email or password' }));
    await renderAuth('/sign-in');

    await fireEvent.changeText(screen.getByTestId('email-input'), 'ana@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'wrong-pass');
    await fireEvent.press(screen.getByTestId('sign-in-button'));

    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
  });

  it('sign up sends the email trimmed and lower-cased (A04-AC-3)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: 'a', refreshToken: 'r', user }));
    await renderAuth('/sign-up');

    await fireEvent.changeText(screen.getByTestId('email-input'), '  Ana@Example.COM ');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-pass');
    await fireEvent.press(screen.getByTestId('sign-up-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auth\/register$/);
    expect(sentBody()).toEqual({ email: 'ana@example.com', password: 'secret-pass' });
  });

  it('sign up shows the ApiError message (A04-AC-3)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'Email already registered' }));
    await renderAuth('/sign-up');

    await fireEvent.changeText(screen.getByTestId('email-input'), 'ana@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-pass');
    await fireEvent.press(screen.getByTestId('sign-up-button'));

    expect(await screen.findByText('Email already registered')).toBeTruthy();
  });

  it('sign up stays disabled until the password has 8 characters (A04-AC-4)', async () => {
    await renderAuth('/sign-up');
    await fireEvent.changeText(screen.getByTestId('email-input'), 'ana@example.com');

    await fireEvent.changeText(screen.getByTestId('password-input'), '1234567');
    expect(screen.getByTestId('sign-up-button').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('sign-up-button'));
    expect(fetchMock).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('password-input'), '12345678');
    expect(screen.getByTestId('sign-up-button').props.accessibilityState.disabled).toBe(false);
  });
});

// --- A11: web token store, native token store, sign-in and sign-up errors ----------
type TokenStore = typeof import('@/api/tokenStorage');

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = jest.fn((k: string) => (this.data.has(k) ? (this.data.get(k) as string) : null));
  setItem = jest.fn((k: string, v: string) => {
    this.data.set(k, String(v));
  });
  removeItem = jest.fn((k: string) => {
    this.data.delete(k);
  });
  clear = jest.fn(() => this.data.clear());
  key = jest.fn((i: number) => Array.from(this.data.keys())[i] ?? null);
  get length() {
    return this.data.size;
  }
  raw(k: string) {
    return this.data.get(k);
  }
  keys() {
    return Array.from(this.data.keys());
  }
}

// Loaded inside each case, so a missing module fails that case, not the whole file.
const loadWebStore = () => require('@/api/tokenStorage.web') as TokenStore;
const loadNativeStore = () => require('@/api/tokenStorage.ts') as TokenStore;

describe('A11: token stores', () => {
  let storage: MemoryStorage;
  let hadLocalStorage: boolean;
  let originalLocalStorage: unknown;

  beforeEach(() => {
    storage = new MemoryStorage();
    hadLocalStorage = 'localStorage' in globalThis;
    originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (hadLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });

  it('web store returns the saved pair (A11-AC-1)', async () => {
    const web = loadWebStore();
    await web.saveTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    expect(await web.getAccessToken()).toBe('acc-1');
    expect(await web.getRefreshToken()).toBe('ref-1');
  });

  it('web store clearTokens empties both (A11-AC-1)', async () => {
    const web = loadWebStore();
    await web.saveTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    await web.clearTokens();
    expect(await web.getAccessToken()).toBeNull();
    expect(await web.getRefreshToken()).toBeNull();
  });

  it('web store is null when empty (A11-AC-1)', async () => {
    const web = loadWebStore();
    expect(await web.getAccessToken()).toBeNull();
    expect(await web.getRefreshToken()).toBeNull();
  });

  it('web store keeps the pair in localStorage under the two keys (A11-AC-1)', async () => {
    const web = loadWebStore();
    await web.saveTokens({ accessToken: 'acc-2', refreshToken: 'ref-2' });
    expect(storage.raw('ljiljan.accessToken')).toBe('acc-2');
    expect(storage.raw('ljiljan.refreshToken')).toBe('ref-2');
  });

  it('web store calls no expo-secure-store function (A11-AC-1)', async () => {
    const web = loadWebStore();
    await web.saveTokens({ accessToken: 'acc-3', refreshToken: 'ref-3' });
    await web.getAccessToken();
    await web.getRefreshToken();
    await web.clearTokens();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('web and native stores export the same functions (A11-AC-1)', () => {
    const fnNames = (m: object) =>
      Object.entries(m)
        .filter(([, v]) => typeof v === 'function')
        .map(([k]) => k)
        .sort();
    const native = fnNames(loadNativeStore());
    expect(native).toEqual(['clearTokens', 'getAccessToken', 'getRefreshToken', 'saveTokens']);
    expect(fnNames(loadWebStore())).toEqual(native);
  });

  it('native store uses expo-secure-store under the two keys and no localStorage (A11-AC-2)', async () => {
    const native = loadNativeStore();
    SecureStore.getItemAsync.mockImplementation(async (k: string) => `v:${k}`);
    await native.saveTokens({ accessToken: 'acc-4', refreshToken: 'ref-4' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('ljiljan.accessToken', 'acc-4');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('ljiljan.refreshToken', 'ref-4');
    expect(await native.getAccessToken()).toBe('v:ljiljan.accessToken');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('ljiljan.accessToken');
    expect(await native.getRefreshToken()).toBe('v:ljiljan.refreshToken');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('ljiljan.refreshToken');
    await native.clearTokens();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ljiljan.accessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ljiljan.refreshToken');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.keys()).toEqual([]);
  });
});

describe('A11: sign-in and sign-up errors', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function texts(): string[] {
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (typeof n === 'string') out.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') walk((n as { children?: unknown }).children);
    };
    walk(screen.toJSON());
    return out;
  }

  let textsBefore: string[] = [];

  async function submit(screenName: 'sign-in' | 'sign-up') {
    await renderAuth(`/${screenName}`);
    await fireEvent.changeText(screen.getByTestId('email-input'), 'ana@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-pass');
    textsBefore = texts();
    await fireEvent.press(screen.getByTestId(`${screenName}-button`));
  }

  const connectionMessage = {
    'sign-in': 'Could not sign in. Check your connection.',
    'sign-up': 'Could not create your account. Check your connection.',
  } as const;

  for (const screenName of ['sign-in', 'sign-up'] as const) {
    const ac = screenName === 'sign-in' ? 'A11-AC-3' : 'A11-AC-4';
    it(`${screenName}: a rejected fetch shows the connection message (${ac})`, async () => {
      fetchMock.mockRejectedValue(new TypeError('Network request failed'));
      await submit(screenName);
      expect(await screen.findByText(connectionMessage[screenName])).toBeTruthy();
    });

    it(`${screenName}: a token store failure does not show the connection message (${ac})`, async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { accessToken: 'a', refreshToken: 'r', user }),
      );
      SecureStore.setItemAsync.mockRejectedValue(new TypeError('storage unavailable'));
      await submit(screenName);

      // Wait until some error text has rendered, then check what it says.
      await waitFor(() =>
        expect(texts().filter((t) => !textsBefore.includes(t) && t.trim() !== '')).not.toEqual([]),
      );
      expect(screen.queryByText(/connection/i)).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it(`${screenName}: a 401 shows the server message (${ac})`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Invalid email or password' }));
      await submit(screenName);
      expect(await screen.findByText('Invalid email or password')).toBeTruthy();
    });
  }
});
