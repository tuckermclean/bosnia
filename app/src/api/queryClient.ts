import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    // Don't retry client errors (bad request, unauthorized after refresh, not found, ...).
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
    },
    mutations: {
      retry: false,
    },
  },
});
