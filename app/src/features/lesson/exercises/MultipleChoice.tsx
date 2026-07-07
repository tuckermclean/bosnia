import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import type { ExerciseComponentProps } from './types';

/**
 * `multiple_choice`: learner picks the correct translation of
 * `exercise.payload.prompt` from `exercise.payload.choices`. Correct answer
 * is `exercise.payload.answer`.
 */
export function MultipleChoice({ exercise, onComplete }: ExerciseComponentProps) {
  const { payload } = exercise;
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const choices = useMemo(() => payload.choices ?? [], [payload.choices]);
  const isCorrect = checked && selected === payload.answer;

  function handleSelect(choice: string) {
    if (checked) return;
    setSelected(choice);
  }

  function handleCheck() {
    if (!selected) return;
    setChecked(true);
  }

  function handleContinue() {
    onComplete({ correct: selected === payload.answer });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>{payload.prompt}</Text>
      {payload.promptEn ? <Text style={styles.promptHint}>{payload.promptEn}</Text> : null}

      <View style={styles.choices}>
        {choices.map((choice) => {
          const isSelected = selected === choice;
          const showCorrect = checked && choice === payload.answer;
          const showWrong = checked && isSelected && choice !== payload.answer;

          return (
            <Pressable
              key={choice}
              testID={`choice-${choice}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: checked }}
              onPress={() => handleSelect(choice)}
              disabled={checked}
              style={[
                styles.choice,
                isSelected && styles.choiceSelected,
                showCorrect && styles.choiceCorrect,
                showWrong && styles.choiceWrong,
              ]}
            >
              <Text
                style={[
                  styles.choiceLabel,
                  (isSelected || showCorrect) && styles.choiceLabelActive,
                ]}
              >
                {choice}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {checked && (
        <Card
          style={[styles.feedback, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}
          padded
        >
          <Text style={styles.feedbackText}>
            {isCorrect ? 'Tačno! Correct.' : `Not quite. Correct answer: ${payload.answer}`}
          </Text>
        </Card>
      )}

      {!checked ? (
        <Button label="Check" onPress={handleCheck} disabled={!selected} testID="check-button" />
      ) : (
        <Button
          label="Continue"
          onPress={handleContinue}
          variant={isCorrect ? 'primary' : 'secondary'}
          testID="continue-button"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  prompt: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: color.blue900,
  },
  promptHint: {
    fontSize: fontSize.sm,
    color: color.gray500,
  },
  choices: {
    gap: spacing.sm,
  },
  choice: {
    borderWidth: 2,
    borderColor: color.gray200,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: color.white,
  },
  choiceSelected: {
    borderColor: color.blue500,
    backgroundColor: color.blue50,
  },
  choiceCorrect: {
    borderColor: color.success,
    backgroundColor: color.successBg,
  },
  choiceWrong: {
    borderColor: color.error,
    backgroundColor: color.errorBg,
  },
  choiceLabel: {
    fontSize: fontSize.md,
    color: color.gray700,
    fontWeight: fontWeight.medium,
  },
  choiceLabelActive: {
    color: color.blue900,
  },
  feedback: {
    borderWidth: 0,
  },
  feedbackCorrect: {
    backgroundColor: color.successBg,
  },
  feedbackWrong: {
    backgroundColor: color.errorBg,
  },
  feedbackText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.gray800,
  },
});
