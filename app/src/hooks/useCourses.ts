import { useQuery } from '@tanstack/react-query';
import { coursesApi } from '@/api';

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: coursesApi.getCourses,
  });
}
