import { useQuery } from '@tanstack/react-query';
import { coursesApi } from '@/api';

export function useLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => coursesApi.getLesson(lessonId as string),
    enabled: Boolean(lessonId),
  });
}
