import React from 'react';
import { Text } from 'react-native';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useAuthStore } from '@/state/authStore';
import type { User } from '@/types/api';
import { fireEvent } from 'expo-router/testing-library';
import { ApiError } from '@/api/client';

// expo-router's matchers (`expo-router/testing-library` registers them) ship
// without types.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHavePathname(pathname: string): R;
      toHavePathnameWithParams(pathname: string): R;
    }
  }
}

// --- Mocks: no network, no secure store. -----------------------------------

// `authApi` is a set of jest mocks; everything else in `@/api` (including the
// real `ApiError`) stays as it is.
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api'),
  authApi: {
    me: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
  },
}));

jest.mock('@/api/tokenStorage', () => ({
  ...jest.requireActual('@/api/tokenStorage'),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

// Native-only module jest-expo does not mock: the splash screen is a no-op.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
  hide: jest.fn(),
  setOptions: jest.fn(),
}));

// `standard-navigation` ships untranspiled ESM that jest's transform ignore list
// (A01's config, unchanged) skips. This is its whole implementation, verbatim.
jest.mock('standard-navigation', () => ({
  createStandardNavigator: (NavigatorContent: unknown) => ({
    type: 'standard',
    version: 1,
    NavigatorContent,
  }),
}));

const { authApi } = require('@/api') as typeof import('@/api');
const { saveTokens, clearTokens } = require('@/api/tokenStorage') as typeof import('@/api/tokenStorage');

const mockMe = authApi.me as jest.Mock;
const mockLogin = authApi.login as jest.Mock;
const mockRegister = authApi.register as jest.Mock;
const mockSaveTokens = saveTokens as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;

// --- Shared scaffolding. -----------------------------------------------------

const user = { id: 'u1', email: 'ana@example.com' } as unknown as User;

function stub(label: string) {
  return function Stub() {
    return <Text>{label}</Text>;
  };
}

// The shell's real route files (A04) plus stub screens for the rest.
function routeMap() {
  return {
    _layout: require('../app/_layout').default,
    index: require('../app/index').default,
    '(auth)/_layout': require('../app/(auth)/_layout').default,
    '(auth)/sign-in': require('../app/(auth)/sign-in').default,
    '(auth)/sign-up': require('../app/(auth)/sign-up').default,
    '(tabs)/_layout': require('../app/(tabs)/_layout').default,
    '(tabs)/home': stub('Learn stub'),
    '(tabs)/tutor': stub('Tutor tab stub'),
    '(tabs)/profile': stub('Profile stub'),
    'lesson/[id]': stub('Lesson stub'),
    tutor: stub('Tutor stub'),
  };
}

// Renders the app at `initialUrl`. Testing Library 14's `render` is async: the
// value is a promise that also carries the router's getters (`getPathname()`,
// ...) that the matchers read. A case keeps it as `app`, passes it to
// `hydrated(app)` and then asserts with `expect(app).toHavePathname(...)`;
// awaiting it yields the plain render result, without the getters.
function renderApp(initialUrl = '/') {
  return renderRouter(routeMap(), { initialUrl });
}

// Waits for the render to finish and the boot hydration to settle.
async function hydrated(app: ReturnType<typeof renderApp>) {
  await app;
  await waitFor(() => {
    expect(useAuthStore.getState().status).not.toMatch(/^(idle|hydrating)$/);
  });
}

beforeEach(() => {
  useAuthStore.setState({ status: 'idle', user: null, error: null });
  mockMe.mockReset();
  mockLogin.mockReset();
  mockRegister.mockReset();
  mockSaveTokens.mockReset().mockResolvedValue(undefined);
  mockClearTokens.mockReset().mockResolvedValue(undefined);
});

// --- Cases. ------------------------------------------------------------------

describe('auth navigation', () => {
  describe('Boot, signed in', () => {
    it('lands on /home (the Learn stub) when me resolves with a user (A04-AC-1)', async () => {
      mockMe.mockResolvedValue(user);

      const app = renderApp();
      await hydrated(app);

      await waitFor(() => expect(app).toHavePathname('/home'));
      expect(screen.getByText('Learn stub')).toBeTruthy();
      expect(screen.queryByTestId('sign-in-button')).toBeNull();
    });
  });

  describe('Boot, signed out', () => {
    it('lands on /sign-in and shows the form when me rejects (A04-AC-1)', async () => {
      mockMe.mockRejectedValue(new Error('401'));

      const app = renderApp();
      await hydrated(app);

      await waitFor(() => expect(app).toHavePathname('/sign-in'));
      expect(screen.getByTestId('sign-in-button')).toBeTruthy();
      expect(screen.getByTestId('email-input')).toBeTruthy();
      expect(screen.getByTestId('password-input')).toBeTruthy();
      expect(screen.queryByText('Learn stub')).toBeNull();
    });
  });

  describe('Log out', () => {
    it('brings the app from /home to /sign-in when logout() runs (A04-AC-2)', async () => {
      mockMe.mockResolvedValue(user);
      const app = renderApp();
      await hydrated(app);
      await waitFor(() => expect(app).toHavePathname('/home'));

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      await waitFor(() => expect(app).toHavePathname('/sign-in'));
      expect(screen.getByTestId('sign-in-button')).toBeTruthy();
      expect(screen.queryByText('Learn stub')).toBeNull();
    });
  });

  describe('Sign in', () => {
    it('lands on /home and drops the form after login resolves, with the email trimmed and lower-cased (A09-AC-1)', async () => {
      mockMe.mockRejectedValue(new Error('401'));
      mockLogin.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user });

      const app = renderApp();
      await hydrated(app);
      await waitFor(() => expect(app).toHavePathname('/sign-in'));

      await fireEvent.changeText(screen.getByTestId('email-input'), '  Ana@Example.COM ');
      await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-pass');
      await fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() => expect(app).toHavePathname('/home'));
      expect(screen.getByText('Learn stub')).toBeTruthy();
      expect(screen.queryByTestId('sign-in-button')).toBeNull();
      expect(mockLogin).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secret-pass' });
    });
  });

  describe('Sign up', () => {
    it('lands on /home after register resolves (A09-AC-2)', async () => {
      mockMe.mockRejectedValue(new Error('401'));
      mockRegister.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user });

      const app = renderApp();
      await hydrated(app);
      await waitFor(() => expect(app).toHavePathname('/sign-in'));

      await fireEvent.press(screen.getByText('New here? Create an account'));
      await waitFor(() => expect(app).toHavePathname('/sign-up'));

      await fireEvent.changeText(screen.getByTestId('email-input'), 'ana@example.com');
      await fireEvent.changeText(screen.getByTestId('password-input'), '12345678');
      await fireEvent.press(screen.getByTestId('sign-up-button'));

      await waitFor(() => expect(app).toHavePathname('/home'));
      expect(screen.getByText('Learn stub')).toBeTruthy();
      expect(mockRegister).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failed sign in', () => {
    it('stays on /sign-in and shows the error when login rejects (A09-AC-3)', async () => {
      mockMe.mockRejectedValue(new Error('401'));
      mockLogin.mockRejectedValue(new ApiError(401, 'Invalid email or password'));

      const app = renderApp();
      await hydrated(app);
      await waitFor(() => expect(app).toHavePathname('/sign-in'));

      await fireEvent.changeText(screen.getByTestId('email-input'), 'ana@example.com');
      await fireEvent.changeText(screen.getByTestId('password-input'), 'wrong-pass');
      await fireEvent.press(screen.getByTestId('sign-in-button'));

      await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());
      expect(app).toHavePathname('/sign-in');
      expect(screen.queryByText('Learn stub')).toBeNull();
    });
  });
});
