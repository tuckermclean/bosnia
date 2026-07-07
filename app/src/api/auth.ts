import { api } from './client';
import type { AuthResponse, User } from '@/types/api';

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

export function me(): Promise<User> {
  return api.get<User>('/auth/me');
}
