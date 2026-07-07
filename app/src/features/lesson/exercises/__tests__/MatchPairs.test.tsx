import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MatchPairs } from '../MatchPairs';
import type { Exercise } from '@/types/api';

const baseExercise: Exercise = {
  id: 'a1-u1-s1-l1-e3',
  lessonId: 'a1-u1-s1-l1',
  orderIndex: 3,
  type: 'match_pairs',
  reviewStatus: 'unreviewed',
  payload: {
    prompt: 'Match the words',
    pairs: [
      { bs: 'jedan', en: 'one' },
      { bs: 'dva', en: 'two' },
    ],
  },
};

// `MatchPairs` shuffles display order but keeps each item's testID tied to its
// pair's index in `payload.pairs` (e.g. `match-bs-0` / `match-en-0` are always
// the first pair), so these testIDs are stable regardless of shuffle order.

describe('MatchPairs', () => {
  it('matches every pair in a clean run and reports no misses', async () => {
    const onComplete = jest.fn();
    await render(<MatchPairs exercise={baseExercise} onComplete={onComplete} />);

    await fireEvent.press(screen.getByTestId('match-bs-0'));
    await fireEvent.press(screen.getByTestId('match-en-0'));
    await fireEvent.press(screen.getByTestId('match-bs-1'));
    await fireEvent.press(screen.getByTestId('match-en-1'));

    expect(screen.getByText('Sve tačno! All matched.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('continue-button'));
    expect(onComplete).toHaveBeenCalledWith({ correct: true });
  });

  it('still finishes after a wrong attempt, but reports the run as not clean', async () => {
    const onComplete = jest.fn();
    await render(<MatchPairs exercise={baseExercise} onComplete={onComplete} />);

    // Mismatch: pair 0's Bosnian side with pair 1's English side.
    await fireEvent.press(screen.getByTestId('match-bs-0'));
    await fireEvent.press(screen.getByTestId('match-en-1'));

    // Wait out the wrong-flash reset (component clears the selection after
    // ~450ms) before the next tap is accepted; wrapped in `act` since it
    // triggers state updates outside of a fireEvent call.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    await fireEvent.press(screen.getByTestId('match-bs-0'));
    await fireEvent.press(screen.getByTestId('match-en-0'));
    await fireEvent.press(screen.getByTestId('match-bs-1'));
    await fireEvent.press(screen.getByTestId('match-en-1'));

    expect(screen.getByText('Sve tačno! All matched.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('continue-button'));
    expect(onComplete).toHaveBeenCalledWith({ correct: false });
  });
});
