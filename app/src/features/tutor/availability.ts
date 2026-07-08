import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Whether the real-time voice tutor (LiveKit + native WebRTC) can run in the
 * current runtime.
 *
 * Expo Go does not ship the native WebRTC module `@livekit/react-native`
 * depends on, so attempting to load LiveKit there crashes the whole app.
 * The voice tutor therefore only works in a development build or a
 * standalone (store) build, both of which bundle the native module.
 *
 * Resolution order (mirrors the env/Constants pattern in `src/api/config.ts`):
 * 1. `EXPO_PUBLIC_ENABLE_VOICE_TUTOR` env var, if set, forces the answer
 *    (`'true'` → available, `'false'` → unavailable). Useful for local
 *    overrides / testing the fallback UI without switching runtimes.
 * 2. Otherwise, unavailable when running inside Expo Go
 *    (`Constants.executionEnvironment === 'storeClient'`), available
 *    everywhere else (dev client / standalone builds).
 */
export function isVoiceTutorAvailable(): boolean {
  const override = process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;
  if (override === 'false') return false;
  if (override === 'true') return true;

  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}
