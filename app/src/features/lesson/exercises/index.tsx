import React from 'react';
import { Text } from 'react-native';
import { MultipleChoice } from './MultipleChoice';
import { WordBank } from './WordBank';
import { MatchPairs } from './MatchPairs';
import { ListenChoose } from './ListenChoose';
import { Speak } from './Speak';
import type { ExerciseComponentProps } from './types';

export * from './types';
export { MultipleChoice, WordBank, MatchPairs, ListenChoose, Speak };

/** Renders the right component for `exercise.type`. One case per exercise type. */
export function ExerciseRenderer({ exercise, onComplete }: ExerciseComponentProps) {
  switch (exercise.type) {
    case 'multiple_choice':
      return <MultipleChoice exercise={exercise} onComplete={onComplete} />;
    case 'word_bank':
      return <WordBank exercise={exercise} onComplete={onComplete} />;
    case 'match_pairs':
      return <MatchPairs exercise={exercise} onComplete={onComplete} />;
    case 'listen_choose':
      return <ListenChoose exercise={exercise} onComplete={onComplete} />;
    case 'speak':
      return <Speak exercise={exercise} onComplete={onComplete} />;
    default:
      return <Text>Unsupported exercise type: {exercise.type}</Text>;
  }
}
