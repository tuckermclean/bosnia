import { api } from './client';
import type { AuthResponse, MeResponse, User } from '@/types/api';

export interface Credentials {
  email: string;
  password: string;
}

export function register(credentials: Credentials): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/register', credentials, { skipAuth: true });
}

export function login(credentials: Credentials): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/login', credentials, { skipAuth: true });
}

export async function me(): Promise<User> {
  const res = await api.get<MeResponse>('/auth/me');
  return res.user;
}
