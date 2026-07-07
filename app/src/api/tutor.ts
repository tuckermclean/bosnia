import { api } from './client';
import type { TutorSessionRequest, TutorSessionResponse } from '@/types/api';

export function startTutorSession(payload: TutorSessionRequest = {}): Promise<TutorSessionResponse> {
  return api.post<TutorSessionResponse>('/tutor/session', payload);
}
