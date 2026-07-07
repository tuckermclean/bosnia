import { useMutation } from '@tanstack/react-query';
import { pronunciationApi } from '@/api';

export function useSubmitPronunciation() {
  return useMutation({
    mutationFn: pronunciationApi.submitPronunciation,
  });
}
