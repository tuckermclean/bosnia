/**
 * A13 web-voice-tutor (A13-AC-1..5).
 *
 * The jest preset resolves modules for a native platform, so the web call
 * component is required by its file, at run time inside each test: while the
 * file is missing each case fails on its own instead of crashing the suite.
 *
 * Wording the spec does not fix is matched loosely:
 *  - microphone message: /microphone/ followed (same sentence) by "not available",
 *    "isn't available" or "unavailable";
 *  - room error message: the same with /call/.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useTutorSession } from '@/hooks/useTutor';
import { useCourses } from '@/hooks/useCourses';
import { isVoiceTutorAvailable } from '@/features/tutor/availability';

// ---- mocks ---------------------------------------------------------------

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock('@/hooks/useCourses', () => ({ useCourses: jest.fn() }));
jest.mock('@/hooks/useTutor', () => ({ useTutorSession: jest.fn() }));

// The native LiveKit packages must never be reached by the web call.
jest.mock('@livekit/react-native', () => {
  throw new Error('@livekit/react-native must not be loaded on web');
});
jest.mock('@livekit/react-native-webrtc', () => {
  throw new Error('@livekit/react-native-webrtc must not be loaded on web');
});

const mockRoomProps = jest.fn();
const mockRoom = { disconnect: jest.fn() };
const mockLocalParticipant = {
  publishData: jest.fn(),
  setMicrophoneEnabled: jest.fn(),
};
let mockConnectionState = 'connected';
let mockIsMicEnabled = true;
let mockAgent: { state: string; agentTranscriptions: { id: string; text: string }[] } = {
  state: 'listening',
  agentTranscriptions: [],
};
jest.mock('@livekit/components-react', () => {
  const { View, Text } = require('react-native');
  return {
    LiveKitRoom: (props: { children?: React.ReactNode }) => {
      mockRoomProps(props);
      return <View testID="livekit-room">{props.children}</View>;
    },
    RoomAudioRenderer: () => <Text>room-audio-renderer</Text>,
    useRoomContext: () => mockRoom,
    useConnectionState: () => mockConnectionState,
    useLocalParticipant: () => ({
      isMicrophoneEnabled: mockIsMicEnabled,
      localParticipant: mockLocalParticipant,
    }),
    useVoiceAssistant: () => mockAgent,
  };
});

// Screen cases: React.lazy cannot run a dynamic import() in jest, so it is
// replaced by a stand-in that loads the (mocked) module with require() on
// render; a load failure is a throw during that render, as a rejected lazy
// load is in React.
let mockLoadFails = false;
let mockRenderFails = false;
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    lazy: (_factory: unknown) =>
      function LazyStandIn(props: Record<string, unknown>) {
        if (mockLoadFails) throw new Error('Loading chunk failed');
        const Live = require('@/features/tutor/VoiceCallLive').default;
        return actual.createElement(Live, props);
      },
  };
});
jest.mock('@/features/tutor/VoiceCallLive', () => ({
  __esModule: true,
  default: () => {
    if (mockRenderFails) throw new Error('call component crashed');
    const { Text } = require('react-native');
    return <Text>live-call-stub</Text>;
  },
}));

// ---- helpers -------------------------------------------------------------

type CallProps = { level?: 'A1' | 'A2' | 'B1' | 'B2'; onEnd?: () => void };
const loadWeb = () =>
  require('../src/features/tutor/VoiceCallLive.web').default as React.ComponentType<CallProps>;

const mockedSession = useTutorSession as jest.Mock;
const mockedCourses = useCourses as jest.Mock;

const SESSION = { url: 'wss://lk.example', token: 'tok-123', sessionId: 'sess-1' };

function lastRoomProps() {
  const calls = mockRoomProps.mock.calls;
  return calls[calls.length - 1][0] as Record<string, any>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadFails = false;
  mockRenderFails = false;
  mockConnectionState = 'connected';
  mockIsMicEnabled = true;
  mockAgent = { state: 'listening', agentTranscriptions: [] };
  mockLocalParticipant.publishData.mockResolvedValue(undefined);
  mockedSession.mockReturnValue({ isLoading: false, isError: false, data: SESSION });
  mockedCourses.mockReturnValue({ isLoading: false, isError: false, data: undefined });
});

// ---- Session (A13-AC-1) --------------------------------------------------

describe('web call: Session', () => {
  it('shows the connecting text while the session loads (A13-AC-1)', async () => {
    mockedSession.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const Call = loadWeb();
    await render(<Call level="A1" onEnd={jest.fn()} />);
    expect(screen.getByText('Connecting to Ljilja…')).toBeTruthy();
    expect(mockRoomProps).not.toHaveBeenCalled();
  });

  it('shows the failure message and a Back button that calls onEnd (A13-AC-1)', async () => {
    mockedSession.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    const onEnd = jest.fn();
    const Call = loadWeb();
    await render(<Call level="A1" onEnd={onEnd} />);
    expect(screen.getByText(/Couldn't start the tutor session/)).toBeTruthy();
    fireEvent.press(screen.getByText('Back'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('requests the session for the level it is given (A13-AC-1)', async () => {
    const Call = loadWeb();
    await render(<Call level="B1" onEnd={jest.fn()} />);
    expect(mockedSession).toHaveBeenCalledWith('B1');
  });
});

// ---- Room (A13-AC-1) -----------------------------------------------------

describe('web call: Room', () => {
  it('joins with the session url and token, connect and audio (A13-AC-1)', async () => {
    const Call = loadWeb();
    await render(<Call level="A1" onEnd={jest.fn()} />);
    const props = lastRoomProps();
    expect(props.serverUrl).toBe('wss://lk.example');
    expect(props.token).toBe('tok-123');
    expect(props.connect).toBeTruthy();
    expect(props.audio).toBeTruthy();
  });

  it('renders the tutor audio inside the room (A13-AC-1)', async () => {
    const Call = loadWeb();
    await render(<Call level="A1" onEnd={jest.fn()} />);
    const room = screen.getByTestId('livekit-room');
    expect(room).toBeTruthy();
    expect(screen.getByText('room-audio-renderer')).toBeTruthy();
  });
});

// ---- Call (A13-AC-2) -----------------------------------------------------

describe('web call: Call', () => {
  it('reads "Connecting…" before the room is connected (A13-AC-2)', async () => {
    mockConnectionState = 'connecting';
    const Call = loadWeb();
    await render(<Call onEnd={jest.fn()} />);
    expect(screen.getByText('Connecting…')).toBeTruthy();
  });

  it.each([
    ['listening', 'Listening…'],
    ['thinking', 'Ljilja is thinking…'],
    ['speaking', 'Ljilja is speaking'],
    ['initializing', 'Connected'],
  ])('once connected, agent state %s reads %s (A13-AC-2)', async (state, label) => {
    mockAgent = { state, agentTranscriptions: [] };
    const Call = loadWeb();
    await render(<Call onEnd={jest.fn()} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('lists the transcript segments (A13-AC-2)', async () => {
    mockAgent = {
      state: 'listening',
      agentTranscriptions: [
        { id: 't1', text: 'Dobar dan!' },
        { id: 't2', text: 'Kako si danas?' },
      ],
    };
    const Call = loadWeb();
    await render(<Call onEnd={jest.fn()} />);
    expect(screen.getByText('Dobar dan!')).toBeTruthy();
    expect(screen.getByText('Kako si danas?')).toBeTruthy();
  });

  it('mute turns the microphone off when it is on (A13-AC-2)', async () => {
    mockIsMicEnabled = true;
    const Call = loadWeb();
    await render(<Call onEnd={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Mute microphone'));
    expect(mockLocalParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('mute turns the microphone on when it is off (A13-AC-2)', async () => {
    mockIsMicEnabled = false;
    const Call = loadWeb();
    await render(<Call onEnd={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Unmute microphone'));
    expect(mockLocalParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('interrupt publishes the interrupt message on lk.interrupt (A13-AC-2)', async () => {
    mockAgent = { state: 'speaking', agentTranscriptions: [] };
    const Call = loadWeb();
    await render(<Call onEnd={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Interrupt Ljilja'));
    expect(mockLocalParticipant.publishData).toHaveBeenCalledTimes(1);
    const [data, options] = mockLocalParticipant.publishData.mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(data))).toEqual({ type: 'interrupt' });
    expect(options).toMatchObject({ reliable: true, topic: 'lk.interrupt' });
  });

  it('end call disconnects the room and calls onEnd (A13-AC-2)', async () => {
    const onEnd = jest.fn();
    const Call = loadWeb();
    await render(<Call onEnd={onEnd} />);
    fireEvent.press(screen.getByLabelText('End call'));
    expect(mockRoom.disconnect).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

// ---- Microphone (A13-AC-3) -----------------------------------------------

describe('web call: Microphone', () => {
  it('a media-device failure shows a microphone message and a Back button (A13-AC-3)', async () => {
    const onEnd = jest.fn();
    const Call = loadWeb();
    await render(<Call onEnd={onEnd} />);
    await act(async () => {
      lastRoomProps().onMediaDeviceFailure?.('PermissionDenied', 'audioinput');
    });
    expect(
      screen.getAllByText(/microphone[^.]*(not available|n't available|unavailable)/i).length,
    ).toBeGreaterThan(0);
    fireEvent.press(screen.getByText('Back'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('a room error shows a call message and a Back button (A13-AC-3)', async () => {
    const onEnd = jest.fn();
    const Call = loadWeb();
    await render(<Call onEnd={onEnd} />);
    await act(async () => {
      lastRoomProps().onError?.(new Error('room exploded'));
    });
    expect(
      screen.getAllByText(/call[^.]*(not available|n't available|unavailable)/i).length,
    ).toBeGreaterThan(0);
    fireEvent.press(screen.getByText('Back'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

// ---- Availability (A13-AC-4) ---------------------------------------------

describe('isVoiceTutorAvailable on web', () => {
  const originalOverride = process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = require('expo-constants').default as { executionEnvironment: string };
  let restoreOS: (() => void) | undefined;

  function asWeb() {
    const replaced = jest.replaceProperty(Platform, 'OS', 'web');
    restoreOS = () => replaced.restore();
  }

  afterEach(() => {
    restoreOS?.();
    restoreOS = undefined;
    if (originalOverride === undefined) delete process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;
    else process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR = originalOverride;
    Constants.executionEnvironment = 'bare';
  });

  it('is true with no override (A13-AC-4)', () => {
    asWeb();
    delete process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;
    expect(isVoiceTutorAvailable()).toBe(true);
  });

  it('is true with no override even if Constants reports Expo Go (A13-AC-4)', () => {
    asWeb();
    Constants.executionEnvironment = 'storeClient';
    delete process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR;
    expect(isVoiceTutorAvailable()).toBe(true);
  });

  it('is false with EXPO_PUBLIC_ENABLE_VOICE_TUTOR=false (A13-AC-4)', () => {
    asWeb();
    process.env.EXPO_PUBLIC_ENABLE_VOICE_TUTOR = 'false';
    expect(isVoiceTutorAvailable()).toBe(false);
  });
});

// ---- Screen (A13-AC-5) ---------------------------------------------------

describe('tutor screen error boundary', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  const loadScreen = () => require('../app/tutor').default as React.ComponentType;

  it('renders the call when it loads and renders fine (A13-AC-5)', async () => {
    const Screen = loadScreen();
    await render(<Screen />);
    expect(await screen.findByText('live-call-stub')).toBeTruthy();
    expect(screen.queryByText("The voice tutor couldn't start.")).toBeNull();
  });

  it('shows the message and a Back button when the call throws while rendering (A13-AC-5)', async () => {
    mockRenderFails = true;
    const Screen = loadScreen();
    await render(<Screen />);
    expect(await screen.findByText("The voice tutor couldn't start.")).toBeTruthy();
    fireEvent.press(screen.getByText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the message and a Back button when loading the call fails (A13-AC-5)', async () => {
    mockLoadFails = true;
    const Screen = loadScreen();
    await render(<Screen />);
    expect(await screen.findByText("The voice tutor couldn't start.")).toBeTruthy();
    fireEvent.press(screen.getByText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
