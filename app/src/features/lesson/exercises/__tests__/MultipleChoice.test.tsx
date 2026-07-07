import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MultipleChoice } from '../MultipleChoice';
import type { Exercise } from '@/types/api';

const baseExercise: Exercise = {
  id: 'a1-u1-s1-l1-e1',
  lessonId: 'a1-u1-s1-l1',
  orderIndex: 1,
  type: 'multiple_choice',
  reviewStatus: 'unreviewed',
  payload: {
    prompt: "Kako se kaže 'hello' na bosanskom?",
    promptEn: "How do you say 'hello' in Bosnian?",
    answer: 'zdravo',
    choices: ['zdravo', 'hvala', 'doviđenja', 'molim'],
    translationDirection: 'en->bs',
  },
};

describe('MultipleChoice', () => {
  it('disables Check until a choice is selected, then reports a correct answer', async () => {
    const onComplete = jest.fn();
    await render(<MultipleChoice exercise={baseExercise} onComplete={onComplete} />);

    expect(screen.getByText(baseExercise.payload.prompt)).toBeTruthy();

    // No selection yet: pressing Check should not reveal the Continue button.
    await fireEvent.press(screen.getByTestId('check-button'));
    expect(screen.queryByTestId('continue-button')).toBeNull();

    // Select the correct choice, then check.
    await fireEvent.press(screen.getByTestId('choice-zdravo'));
    await fireEvent.press(screen.getByTestId('check-button'));

    expect(screen.getByText('Tačno! Correct.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('continue-button'));
    expect(onComplete).toHaveBeenCalledWith({ correct: true });
  });

  it('reports an incorrect answer when the wrong choice is checked', async () => {
    const onComplete = jest.fn();
    await render(<MultipleChoice exercise={baseExercise} onComplete={onComplete} />);

    await fireEvent.press(screen.getByTestId('choice-hvala'));
    await fireEvent.press(screen.getByTestId('check-button'));

    expect(screen.getByText('Not quite. Correct answer: zdravo')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('continue-button'));
    expect(onComplete).toHaveBeenCalledWith({ correct: false });
  });
});
