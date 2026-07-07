import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { WordBank } from '../WordBank';
import type { Exercise } from '@/types/api';

const baseExercise: Exercise = {
  id: 'a1-u1-s1-l1-e2',
  lessonId: 'a1-u1-s1-l1',
  orderIndex: 2,
  type: 'word_bank',
  reviewStatus: 'unreviewed',
  payload: {
    prompt: "Build: 'I am well'",
    promptEn: "Build: 'I am well'",
    answer: 'Ja sam dobro',
    choices: ['Ja', 'sam', 'dobro'],
    translationDirection: 'en->bs',
  },
};

describe('WordBank', () => {
  it('lets the learner assemble tiles in order and reports a correct answer', async () => {
    const onComplete = jest.fn();
    await render(<WordBank exercise={baseExercise} onComplete={onComplete} />);

    expect(screen.getByText(baseExercise.payload.prompt)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('bank-Ja-0'));
    await fireEvent.press(screen.getByTestId('bank-sam-1'));
    await fireEvent.press(screen.getByTestId('bank-dobro-2'));

    await fireEvent.press(screen.getByText('Check'));
    expect(screen.getByText('Tačno! Correct.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Continue'));
    expect(onComplete).toHaveBeenCalledWith({ correct: true });
  });

  it('lets the learner remove a tile before checking, and reports a wrong answer for the wrong order', async () => {
    const onComplete = jest.fn();
    await render(<WordBank exercise={baseExercise} onComplete={onComplete} />);

    // Build out of order: "dobro Ja sam" (wrong).
    await fireEvent.press(screen.getByTestId('bank-dobro-2'));
    await fireEvent.press(screen.getByTestId('bank-Ja-0'));
    await fireEvent.press(screen.getByTestId('bank-sam-1'));

    // Tapping a built tile sends it back to the bank.
    await fireEvent.press(screen.getByTestId('built-sam-1'));
    expect(screen.queryByTestId('built-sam-1')).toBeNull();
    expect(screen.getByTestId('bank-sam-1')).toBeTruthy();

    // Put it back, still in the wrong order overall.
    await fireEvent.press(screen.getByTestId('bank-sam-1'));

    await fireEvent.press(screen.getByText('Check'));
    expect(screen.getByText('Correct answer: Ja sam dobro')).toBeTruthy();

    await fireEvent.press(screen.getByText('Continue'));
    expect(onComplete).toHaveBeenCalledWith({ correct: false });
  });
});
