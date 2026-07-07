import { useQuery } from '@tanstack/react-query';
import { tutorApi } from '@/api';
import type { CefrLevel } from '@/types/api';

/**
 * Requests a fresh LiveKit room + token when the tutor screen mounts.
 * A tutor session is inherently one-shot, so this is modeled as a query with
 * no caching/retries rather than a mutation the caller has to remember to fire.
 */
export function useTutorSession(level?: CefrLevel, scenario?: string) {
  return useQuery({
    queryKey: ['tutor-session', level ?? null, scenario ?? null],
    queryFn: () => tutorApi.startTutorSession({ level, scenario }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
