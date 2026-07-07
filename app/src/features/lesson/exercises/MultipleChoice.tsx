import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import type { ExerciseComponentProps } from './types';

/**
 * `multiple_choice`: learner picks the correct translation of `exercise.prompt`
 * from `exercise.choices`. Correct answer is `exercise.answer`.
 */
export function MultipleChoice({ exercise, onComplete }: ExerciseComponentProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const choices = useMemo(() => exercise.choices ?? [], [exercise.choices]);
  const isCorrect = checked && selected === exercise.answer;
  const isWrong = checked && selected !== exercise.answer;

  function handleSelect(choice: string) {
    if (checked) return;
    setSelected(choice);
  }

  function handleCheck() {
    if (!selected) return;
    setChecked(true);
  }

  function handleContinue() {
    onComplete({ correct: selected === exercise.answer });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>{exercise.prompt}</Text>
      {exercise.promptEn ? <Text style={styles.promptHint}>{exercise.promptEn}</Text> : null}

      <View style={styles.choices}>
        {choices.map((choice) => {
          const isSelected = selected === choice;
          const showCorrect = checked && choice === exercise.answer;
          const showWrong = checked && isSelected && choice !== exercise.answer;

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
            {isCorrect ? 'Tačno! Correct.' : `Not quite. Correct answer: ${exercise.answer}`}
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
