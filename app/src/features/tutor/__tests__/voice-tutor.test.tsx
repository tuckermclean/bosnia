import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TutorCallScreen from '../../../../app/tutor';
import { deriveLearnerLevel } from '../level';
import { isVoiceTutorAvailable } from '../availability';
import { useCourses } from '@/hooks/useCourses';
import { useTutorSession } from '@/hooks/useTutor';
import type { Course } from '@/types/api';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('@/hooks/useCourses', () => ({ useCourses: jest.fn() }));
jest.mock('@/hooks/useTutor', () => ({ useTutorSession: jest.fn() }));
jest.mock('../availability', () => ({ isVoiceTutorAvailable: jest.fn() }));

// Jest cannot run a dynamic import(): React.lazy here loads the module (mocked
// below) with require() when, and only when, the lazy component is rendered.
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    lazy: (_factory: unknown) =>
      function LazyStandIn(props: Record<string, unknown>) {
        const Live = require('@/features/tutor/VoiceCallLive').default;
        return actual.createElement(Live, props);
      },
  };
});

// Records the props the screen passes to the (lazily loaded) call component.
const mockLiveProps = jest.fn();
jest.mock('@/features/tutor/VoiceCallLive', () => {
  (globalThis as { __liveModuleLoads?: number }).__liveModuleLoads =
    ((globalThis as { __liveModuleLoads?: number }).__liveModuleLoads ?? 0) + 1;
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: { level?: string; onEnd?: () => void }) => {
      mockLiveProps(props);
      return <Text>live-call-stub</Text>;
    },
  };
});

const mockRoom = { disconnect: jest.fn() };
const mockRoomProps = jest.fn();
const mockRegisterGlobals = jest.fn();
jest.mock('@livekit/react-native', () => {
  const { View } = require('react-native');
  return {
    registerGlobals: () => mockRegisterGlobals(),
    LiveKitRoom: (props: { children?: React.ReactNode }) => {
      mockRoomProps(props);
      return <View>{props.children}</View>;
    },
    useLocalParticipant: () => ({
      isMicrophoneEnabled: true,
      localParticipant: {
        publishData: jest.fn().mockResolvedValue(undefined),
        setMicrophoneEnabled: jest.fn(),
      },
    }),
    useVoiceAssistant: () => ({ state: 'listening', agentTranscriptions: [] }),
  };
});
jest.mock('@livekit/components-react', () => ({
  useRoomContext: () => mockRoom,
  useConnectionState: () => 'connected',
}));

const mockedAvailable = isVoiceTutorAvailable as jest.Mock;
const mockedUseCourses = useCourses as jest.Mock;
const mockedUseTutorSession = useTutorSession as jest.Mock;

function unit(orderIndex: number, level: string, unlocked: boolean[]) {
  return {
    id: `u${orderIndex}`,
    level,
    title: 'U',
    titleEn: 'U',
    theme: null,
    orderIndex,
    skills: unlocked.map((u, i) => ({
      id: `s${orderIndex}-${i}`,
      title: 'S',
      titleEn: 'S',
      grammarTip: null,
      orderIndex: i,
      reviewStatus: 'reviewed' as const,
      unlocked: u,
      crownLevel: 0,
      lessons: [],
    })),
  };
}

function course(units: ReturnType<typeof unit>[]): Course {
  return { id: 'c', language: 'bs', title: 'Bosnian', units };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedAvailable.mockReturnValue(true);
  mockedUseCourses.mockReturnValue({ isLoading: false, isError: false, data: undefined });
  mockedUseTutorSession.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { url: 'wss://lk.example', token: 'tok-123', sessionId: 'sess-1' },
  });
});

describe('call screen when the voice tutor is unavailable', () => {
  it('shows the development-build message and a Back button (A08-AC-4)', async () => {
    mockedAvailable.mockReturnValue(false);

    await render(<TutorCallScreen />);

    expect(screen.getByText('Voice tutor needs a development build')).toBeTruthy();
    fireEvent.press(screen.getByText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('loads no LiveKit code and never renders the call (A08-AC-4)', async () => {
    mockedAvailable.mockReturnValue(false);

    await render(<TutorCallScreen />);

    expect((globalThis as { __liveModuleLoads?: number }).__liveModuleLoads).toBeUndefined();
    expect(mockLiveProps).not.toHaveBeenCalled();
    expect(mockRegisterGlobals).not.toHaveBeenCalled();
    expect(screen.queryByText('live-call-stub')).toBeNull();
  });
});

describe('learner level', () => {
  it('is A1 by default: no courses, nothing unlocked (A08-AC-5)', () => {
    expect(deriveLearnerLevel(undefined)).toBe('A1');
    expect(deriveLearnerLevel([])).toBe('A1');
    expect(deriveLearnerLevel([course([unit(0, 'B1', [false, false])])])).toBe('A1');
  });

  it('is the level of the highest-ordered unit with an unlocked skill (A08-AC-5)', () => {
    const courses = [
      course([
        unit(0, 'A1', [true]),
        unit(2, 'B1', [false, true]),
        unit(1, 'A2', [true]),
        unit(3, 'B2', [false]),
      ]),
    ];
    expect(deriveLearnerLevel(courses)).toBe('B1');
  });

  it('is passed by the call screen to the call (A08-AC-5)', async () => {
    mockedUseCourses.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [course([unit(0, 'A1', [true]), unit(1, 'A2', [true]), unit(2, 'B1', [false])])],
    });

    await render(<TutorCallScreen />);

    await waitFor(() => expect(screen.getByText('live-call-stub')).toBeTruthy());
    expect(mockLiveProps.mock.calls[0][0].level).toBe('A2');
  });
});

describe('native VoiceCallLive', () => {
  // The screen tests stub this module; the call itself is the real one.
  const VoiceCallLive = jest.requireActual('../VoiceCallLive').default as React.ComponentType<{
    level?: 'A1' | 'A2' | 'B1' | 'B2';
    onEnd?: () => void;
  }>;

  it('requests a session for the level it is given (A08-AC-6)', async () => {
    await render(<VoiceCallLive level="B1" onEnd={jest.fn()} />);

    expect(mockedUseTutorSession).toHaveBeenCalledWith('B1');
  });

  it('joins the room with the session url and token, connect and audio (A08-AC-6)', async () => {
    await render(<VoiceCallLive level="A2" onEnd={jest.fn()} />);

    expect(mockRoomProps).toHaveBeenCalled();
    const props = mockRoomProps.mock.calls[0][0];
    expect(props.serverUrl).toBe('wss://lk.example');
    expect(props.token).toBe('tok-123');
    expect(props.connect).toBe(true);
    expect(props.audio).toBe(true);
  });

  it('end call disconnects from the room and calls onEnd (A08-AC-7)', async () => {
    const onEnd = jest.fn();
    await render(<VoiceCallLive level="A1" onEnd={onEnd} />);

    fireEvent.press(screen.getByTestId('end-call-button'));

    expect(mockRoom.disconnect).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
