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
