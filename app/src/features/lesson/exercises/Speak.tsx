import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components';
import { spacing } from '@/theme/tokens';
import { RecordExercise } from '@/features/pronunciation/RecordExercise';
import type { PronunciationResult } from '@/types/api';
import type { ExerciseComponentProps } from './types';

/** Lessons pass a lower bar than a "great" score — enough to keep momentum. */
const PASS_THRESHOLD = 60;

/**
 * `speak`: the pronunciation exercise. Wraps `RecordExercise` and maps its
 * scored result into the generic lesson-runner `onComplete` contract.
 */
export function Speak({ exercise, onComplete }: ExerciseComponentProps) {
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const { payload } = exercise;

  if (!payload.targetPhrase) {
    return null;
  }

  return (
    <View style={styles.container}>
      <RecordExercise
        targetPhrase={payload.targetPhrase}
        audioUrl={payload.audioUrl}
        exerciseId={exercise.id}
        onComplete={setResult}
      />

      {result && (
        <Button
          label="Continue"
          onPress={() => onComplete({ correct: result.score >= PASS_THRESHOLD })}
          testID="continue-button"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
});
