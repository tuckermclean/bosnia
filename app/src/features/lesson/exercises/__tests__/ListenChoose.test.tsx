import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ListenChoose } from '../ListenChoose';
import type { Exercise } from '@/types/api';

// Isolate the exercise's selection/check/continue logic from expo-audio's
// native playback module, which isn't relevant to this behavior and isn't
// safe to exercise under jest without a real device.
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({ seekTo: jest.fn(), play: jest.fn() })),
  useAudioPlayerStatus: jest.fn(() => ({ playing: false })),
}));

const baseExercise: Exercise = {
  id: 'a1-u1-s1-l1-e4',
  lessonId: 'a1-u1-s1-l1',
  orderIndex: 4,
  type: 'listen_choose',
  reviewStatus: 'unreviewed',
  payload: {
    prompt: 'Šta ste čuli?',
    answer: 'zdravo',
    choices: ['zdravo', 'hvala', 'molim'],
    audioUrl: 'PLACEHOLDER://tts/zdravo',
  },
};

describe('ListenChoose', () => {
  it('disables Check until a choice is selected, then reports a correct answer', async () => {
    const onComplete = jest.fn();
    await render(<ListenChoose exercise={baseExercise} onComplete={onComplete} />);

    expect(screen.getByText(baseExercise.payload.prompt)).toBeTruthy();
    expect(screen.getByText('Audio not available yet')).toBeTruthy();

    await fireEvent.press(screen.getByText('Check'));
    expect(screen.queryByText('Tačno! Correct.')).toBeNull();

    await fireEvent.press(screen.getByTestId('choice-zdravo'));
    await fireEvent.press(screen.getByText('Check'));

    expect(screen.getByText('Tačno! Correct.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Continue'));
    expect(onComplete).toHaveBeenCalledWith({ correct: true });
  });

  it('reports an incorrect answer when the wrong choice is checked', async () => {
    const onComplete = jest.fn();
    await render(<ListenChoose exercise={baseExercise} onComplete={onComplete} />);

    await fireEvent.press(screen.getByTestId('choice-hvala'));
    await fireEvent.press(screen.getByText('Check'));

    expect(screen.getByText('Correct answer: zdravo')).toBeTruthy();

    await fireEvent.press(screen.getByText('Continue'));
    expect(onComplete).toHaveBeenCalledWith({ correct: false });
  });
});
