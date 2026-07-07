import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { progressApi } from '@/api';
import type { LessonCompleteRequest } from '@/types/api';

export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: progressApi.getProgress,
  });
}

export function useCompleteLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LessonCompleteRequest) => progressApi.completeLesson(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}
