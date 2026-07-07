import { api } from './client';
import type { LessonCompleteRequest, LessonCompleteResponse, ProgressResponse } from '@/types/api';

export function getProgress(): Promise<ProgressResponse> {
  return api.get<ProgressResponse>('/progress');
}

export function completeLesson(payload: LessonCompleteRequest): Promise<LessonCompleteResponse> {
  return api.post<LessonCompleteResponse>('/progress/lesson-complete', payload);
}
