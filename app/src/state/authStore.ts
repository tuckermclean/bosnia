import { create } from 'zustand';
import { authApi } from '@/api';
import { registerAuthExpiredHandler } from '@/api/client';
import { clearTokens, saveTokens } from '@/api/tokenStorage';
import type { User } from '@/types/api';

export type AuthStatus = 'idle' | 'hydrating' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  user: null,
  error: null,

  hydrate: async () => {
    set({ status: 'hydrating' });
    try {
      const user = await authApi.me();
      set({ status: 'authenticated', user, error: null });
    } catch {
      set({ status: 'unauthenticated', user: null });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    const res = await authApi.login({ email, password });
    await saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    set({ status: 'authenticated', user: res.user });
  },

  register: async (email, password) => {
    set({ error: null });
    const res = await authApi.register({ email, password });
    await saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    set({ status: 'authenticated', user: res.user });
  },

  logout: async () => {
    await clearTokens();
    set({ status: 'unauthenticated', user: null });
  },
}));

// Wire the network layer's "refresh token rejected" signal back into app
// state, without client.ts needing to import this store directly.
registerAuthExpiredHandler(() => {
  useAuthStore.setState({ status: 'unauthenticated', user: null });
});
