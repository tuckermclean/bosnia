import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import type { ExerciseComponentProps } from './types';

interface Tile {
  key: string;
  word: string;
}

function makeTiles(words: string[]): Tile[] {
  return words.map((word, i) => ({ key: `${word}-${i}`, word }));
}

/**
 * `word_bank`: learner taps word tiles in order to build the translation of
 * `exercise.payload.prompt`. The target sentence is `exercise.payload.answer`;
 * the available tiles are `exercise.payload.choices` (already shuffled by the content pipeline, but
 * we defensively shuffle again so repeat attempts don't feel identical).
 */
export function WordBank({ exercise, onComplete }: ExerciseComponentProps) {
  const { payload } = exercise;
  const bankWords = useMemo(() => payload.choices ?? [], [payload.choices]);
  const [bank, setBank] = useState<Tile[]>(() => makeTiles(bankWords));
  const [built, setBuilt] = useState<Tile[]>([]);
  const [checked, setChecked] = useState(false);

  const builtSentence = built.map((t) => t.word).join(' ');
  const target = (payload.answer ?? '').trim();
  const isCorrect = checked && builtSentence.trim() === target;

  function addTile(tile: Tile) {
    if (checked) return;
    setBank((prev) => prev.filter((t) => t.key !== tile.key));
    setBuilt((prev) => [...prev, tile]);
  }

  function removeTile(tile: Tile) {
    if (checked) return;
    setBuilt((prev) => prev.filter((t) => t.key !== tile.key));
    setBank((prev) => [...prev, tile]);
  }

  function handleCheck() {
    if (built.length === 0) return;
    setChecked(true);
  }

  function handleContinue() {
    onComplete({ correct: builtSentence.trim() === target });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>{payload.prompt}</Text>

      <View style={styles.buildArea} testID="word-bank-built">
        {built.length === 0 ? (
          <Text style={styles.placeholder}>Tap words below…</Text>
        ) : (
          built.map((tile) => (
            <Pressable
              key={tile.key}
              testID={`built-${tile.key}`}
              onPress={() => removeTile(tile)}
              disabled={checked}
              style={styles.builtTile}
            >
              <Text style={styles.tileLabel}>{tile.word}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.bank} testID="word-bank-bank">
        {bank.map((tile) => (
          <Pressable
            key={tile.key}
            testID={`bank-${tile.key}`}
            onPress={() => addTile(tile)}
            disabled={checked}
            style={styles.bankTile}
          >
            <Text style={styles.tileLabel}>{tile.word}</Text>
          </Pressable>
        ))}
      </View>

      {checked && (
        <Card style={isCorrect ? styles.feedbackCorrect : styles.feedbackWrong} padded>
          <Text style={styles.feedbackText}>
            {isCorrect ? 'Tačno! Correct.' : `Correct answer: ${target}`}
          </Text>
        </Card>
      )}

      {!checked ? (
        <Button label="Check" onPress={handleCheck} disabled={built.length === 0} />
      ) : (
        <Button label="Continue" onPress={handleContinue} variant={isCorrect ? 'primary' : 'secondary'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  prompt: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.blue900 },
  buildArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    minHeight: 56,
    borderBottomWidth: 2,
    borderBottomColor: color.gray200,
    paddingBottom: spacing.sm,
  },
  placeholder: { color: color.gray400, fontSize: fontSize.md, alignSelf: 'center' },
  bank: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  bankTile: {
    borderWidth: 2,
    borderColor: color.gray200,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: color.white,
  },
  builtTile: {
    borderWidth: 2,
    borderColor: color.blue300,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: color.blue50,
  },
  tileLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.gray800 },
  feedbackCorrect: { backgroundColor: color.successBg, borderWidth: 0 },
  feedbackWrong: { backgroundColor: color.errorBg, borderWidth: 0 },
  feedbackText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.gray800 },
});
