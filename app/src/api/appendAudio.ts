// React Native's FormData accepts a `{ uri, name, type }` shape for file
// fields; it is not a spec-compliant `Blob` but is what RN's networking
// layer expects when multipart-encoding local files.
export async function appendAudio(
  formData: FormData,
  audioUri: string,
  mimeType: string = 'audio/m4a',
): Promise<void> {
  const name = audioUri.split('/').pop() ?? 'recording.m4a';
  formData.append('audio', { uri: audioUri, name, type: mimeType } as unknown as Blob);
}
