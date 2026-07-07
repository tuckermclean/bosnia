import { apiRequest } from './client';
import type { PronunciationResult } from '@/types/api';

export interface SubmitPronunciationInput {
  /** Local file URI produced by expo-audio (e.g. `file:///…/recording.m4a`). */
  audioUri: string;
  targetPhrase: string;
  exerciseId?: string;
  /** Defaults to `audio/m4a`; override if the recorder was configured differently. */
  mimeType?: string;
}

export function submitPronunciation({
  audioUri,
  targetPhrase,
  exerciseId,
  mimeType = 'audio/m4a',
}: SubmitPronunciationInput): Promise<PronunciationResult> {
  const formData = new FormData();
  const fileName = audioUri.split('/').pop() ?? 'recording.m4a';

  // React Native's FormData accepts this `{ uri, name, type }` shape for file
  // fields; it is not a spec-compliant `Blob` but is what RN's networking
  // layer expects when multipart-encoding local files.
  formData.append('audio', {
    uri: audioUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
  formData.append('targetPhrase', targetPhrase);
  if (exerciseId) formData.append('exerciseId', exerciseId);

  return apiRequest<PronunciationResult>('/pronunciation', {
    method: 'POST',
    formData,
  });
}
