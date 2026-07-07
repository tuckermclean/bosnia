import { api } from './client';
import type { Course, Lesson } from '@/types/api';

export function getCourses(): Promise<Course[]> {
  return api.get<Course[]>('/courses');
}

export function getLesson(lessonId: string): Promise<Lesson> {
  return api.get<Lesson>(`/lessons/${lessonId}`);
}
