import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isVoiceTutorAvailable } from '../availability';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

const mockedConstants = Constants as unknown as { executionEnvironment: ExecutionEnvironment };

describe('isVoiceTutorAvailable', () => {
  const originalOverride = process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR = originalOverride;
    }
    mockedConstants.executionEnvironment = ExecutionEnvironment.Bare;
  });

  it('is false when running in Expo Go (executionEnvironment === "storeClient")', () => {
    mockedConstants.executionEnvironment = ExecutionEnvironment.StoreClient;
    delete process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;

    expect(isVoiceTutorAvailable()).toBe(false);
  });

  it('is true in a dev/standalone build (not Expo Go)', () => {
    mockedConstants.executionEnvironment = ExecutionEnvironment.Standalone;
    delete process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;

    expect(isVoiceTutorAvailable()).toBe(true);
  });

  it('respects EXPO_PUBLIC_ENABLE_VOICE_TUTOR="false" even outside Expo Go', () => {
    mockedConstants.executionEnvironment = ExecutionEnvironment.Standalone;
    process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR = 'false';

    expect(isVoiceTutorAvailable()).toBe(false);
  });

  it('respects EXPO_PUBLIC_ENABLE_VOICE_TUTOR="true" even inside Expo Go', () => {
    mockedConstants.executionEnvironment = ExecutionEnvironment.StoreClient;
    process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR = 'true';

    expect(isVoiceTutorAvailable()).toBe(true);
  });
});
