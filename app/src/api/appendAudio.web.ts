const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
};

function extensionFor(type: string): string {
  const base = type.split(';')[0].trim().toLowerCase();
  if (EXTENSIONS[base]) return EXTENSIONS[base];
  const sub = base.split('/')[1]?.replace(/^x-/, '').replace(/[^a-z0-9]/g, '');
  return sub || 'webm';
}

/** Web: the recording URI is a blob: URL; upload its bytes as a real Blob. */
export async function appendAudio(
  formData: FormData,
  audioUri: string,
  mimeType?: string,
): Promise<void> {
  const response = await fetch(audioUri);
  if (!response.ok) {
    throw new Error(`Could not read the recording (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const type = blob.type || mimeType || 'audio/webm';
  const part = blob.type ? blob : new Blob([blob], { type });
  formData.append('audio', part, `recording.${extensionFor(type)}`);
}
