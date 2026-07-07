import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, Card } from '@/components';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import { isPlayableAudioUrl } from '@/utils/audio';
import type { ExerciseComponentProps } from './types';

/**
 * `listen_choose`: learner plays the Bosnian reference audio
 * (`exercise.payload.audioUrl`) and picks what they heard from
 * `exercise.payload.choices`. Correct answer is `exercise.payload.answer`.
 *
 * Reference audio may be a `PLACEHOLDER://…` sentinel when the content
 * pipeline ran without an Azure TTS key — the listen button is disabled
 * rather than attempting (and failing) to play it.
 */
export function ListenChoose({ exercise, onComplete }: ExerciseComponentProps) {
  const { payload } = exercise;
  const canPlay = isPlayableAudioUrl(payload.audioUrl);
  const player = useAudioPlayer(canPlay ? payload.audioUrl : null);
  const status = useAudioPlayerStatus(player);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const choices = useMemo(() => payload.choices ?? [], [payload.choices]);
  const isCorrect = checked && selected === payload.answer;

  function handlePlay() {
    if (!canPlay) return;
    player.seekTo(0);
    player.play();
  }

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

      <Pressable
        testID="play-audio"
        onPress={handlePlay}
        disabled={!canPlay}
        style={[styles.playButton, !canPlay && styles.playButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Play reference audio"
      >
        <Text style={styles.playIcon}>{status.playing ? '🔊' : '▶️'}</Text>
      </Pressable>
      {!canPlay ? <Text style={styles.audioUnavailable}>Audio not available yet</Text> : null}

      <View style={styles.choices}>
        {choices.map((choice) => {
          const isSelected = selected === choice;
          const showCorrect = checked && choice === payload.answer;
          const showWrong = checked && isSelected && choice !== payload.answer;

          return (
            <Pressable
              key={choice}
              testID={`choice-${choice}`}
              onPress={() => handleSelect(choice)}
              disabled={checked}
              style={[
                styles.choice,
                isSelected && styles.choiceSelected,
                showCorrect && styles.choiceCorrect,
                showWrong && styles.choiceWrong,
              ]}
            >
              <Text style={styles.choiceLabel}>{choice}</Text>
            </Pressable>
          );
        })}
      </View>

      {checked && (
        <Card style={isCorrect ? styles.feedbackCorrect : styles.feedbackWrong} padded>
          <Text style={styles.feedbackText}>
            {isCorrect ? 'Tačno! Correct.' : `Correct answer: ${payload.answer}`}
          </Text>
        </Card>
      )}

      {!checked ? (
        <Button label="Check" onPress={handleCheck} disabled={!selected} />
      ) : (
        <Button label="Continue" onPress={handleContinue} variant={isCorrect ? 'primary' : 'secondary'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  prompt: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.blue900 },
  playButton: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: color.blue700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonDisabled: { backgroundColor: color.gray300 },
  audioUnavailable: {
    alignSelf: 'center',
    fontSize: fontSize.xs,
    color: color.gray400,
  },
  playIcon: { fontSize: 32 },
  choices: { gap: spacing.sm },
  choice: {
    borderWidth: 2,
    borderColor: color.gray200,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: color.white,
  },
  choiceSelected: { borderColor: color.blue500, backgroundColor: color.blue50 },
  choiceCorrect: { borderColor: color.success, backgroundColor: color.successBg },
  choiceWrong: { borderColor: color.error, backgroundColor: color.errorBg },
  choiceLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.gray800 },
  feedbackCorrect: { backgroundColor: color.successBg, borderWidth: 0 },
  feedbackWrong: { backgroundColor: color.errorBg, borderWidth: 0 },
  feedbackText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.gray800 },
});
