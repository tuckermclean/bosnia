import { api } from './client';
import type { Course, CoursesResponse, LessonResponse } from '@/types/api';

/** The backend returns `{ courses: [...] }`; MVP content is a single course. */
export async function getCourses(): Promise<Course[]> {
  const res = await api.get<CoursesResponse>('/courses');
  return res.courses;
}

export function getLesson(lessonId: string): Promise<LessonResponse> {
  return api.get<LessonResponse>(`/lessons/${lessonId}`);
}
