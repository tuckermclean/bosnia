import { appendAudio } from './appendAudio';
import { apiRequest } from './client';
import type { PronunciationResult } from '@/types/api';

export interface SubmitPronunciationInput {
  /** Local file URI produced by expo-audio (e.g. `file:///…/recording.m4a`). */
  audioUri: string;
  targetPhrase: string;
  exerciseId?: string;
  /** Native defaults to `audio/m4a`, web to the recording's own type, else `audio/webm`. */
  mimeType?: string;
}

export async function submitPronunciation({
  audioUri,
  targetPhrase,
  exerciseId,
  mimeType,
}: SubmitPronunciationInput): Promise<PronunciationResult> {
  const formData = new FormData();
  await appendAudio(formData, audioUri, mimeType);
  formData.append('targetPhrase', targetPhrase);
  if (exerciseId) formData.append('exerciseId', exerciseId);

  return apiRequest<PronunciationResult>('/pronunciation', {
    method: 'POST',
    formData,
  });
}
