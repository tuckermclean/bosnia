/**
 * Reference audio URLs come from the content pipeline. When no Azure TTS key
 * is configured server-side, it emits `PLACEHOLDER://<hash>.mp3` sentinels
 * instead of real audio — those must never be handed to the audio player.
 */
export function isPlayableAudioUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}
