import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import type { ExerciseComponentProps } from './types';

interface MatchItem {
  key: string;
  text: string;
  pairId: string;
  side: 'bs' | 'en';
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * `match_pairs`: learner taps a Bosnian word then its English match (or vice
 * versa). Matched pairs lock in place; a wrong tap briefly highlights red and
 * clears the selection. Completes once every pair is matched.
 */
export function MatchPairs({ exercise, onComplete }: ExerciseComponentProps) {
  const { payload } = exercise;
  const pairs = useMemo(() => payload.pairs ?? [], [payload.pairs]);

  const [bsItems] = useState<MatchItem[]>(() =>
    shuffle(pairs.map((p, i) => ({ key: `bs-${i}`, text: p.bs, pairId: `pair-${i}`, side: 'bs' as const })))
  );
  const [enItems] = useState<MatchItem[]>(() =>
    shuffle(pairs.map((p, i) => ({ key: `en-${i}`, text: p.en, pairId: `pair-${i}`, side: 'en' as const })))
  );

  const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set());
  const [selectedBs, setSelectedBs] = useState<MatchItem | null>(null);
  const [selectedEn, setSelectedEn] = useState<MatchItem | null>(null);
  const [wrongFlash, setWrongFlash] = useState<{ bs?: string; en?: string } | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  const allMatched = pairs.length > 0 && matchedPairIds.size === pairs.length;

  function trySelect(item: MatchItem) {
    if (matchedPairIds.has(item.pairId) || wrongFlash) return;

    if (item.side === 'bs') {
      setSelectedBs(item);
      if (selectedEn) evaluate(item, selectedEn);
    } else {
      setSelectedEn(item);
      if (selectedBs) evaluate(selectedBs, item);
    }
  }

  function evaluate(bs: MatchItem, en: MatchItem) {
    if (bs.pairId === en.pairId) {
      setMatchedPairIds((prev) => new Set(prev).add(bs.pairId));
      setSelectedBs(null);
      setSelectedEn(null);
    } else {
      setWrongAttempts((n) => n + 1);
      setWrongFlash({ bs: bs.key, en: en.key });
      setTimeout(() => {
        setWrongFlash(null);
        setSelectedBs(null);
        setSelectedEn(null);
      }, 450);
    }
  }

  function renderItem(item: MatchItem) {
    const isMatched = matchedPairIds.has(item.pairId);
    const isSelected = selectedBs?.key === item.key || selectedEn?.key === item.key;
    const isWrong = wrongFlash?.bs === item.key || wrongFlash?.en === item.key;

    return (
      <Pressable
        key={item.key}
        testID={`match-${item.key}`}
        onPress={() => trySelect(item)}
        disabled={isMatched}
        style={[
          styles.item,
          isSelected && styles.itemSelected,
          isMatched && styles.itemMatched,
          isWrong && styles.itemWrong,
        ]}
      >
        <Text style={styles.itemLabel}>{item.text}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>{payload.prompt}</Text>

      <View style={styles.columns}>
        <View style={styles.column}>{bsItems.map(renderItem)}</View>
        <View style={styles.column}>{enItems.map(renderItem)}</View>
      </View>

      {allMatched && (
        <>
          <Card style={styles.feedbackCorrect} padded>
            <Text style={styles.feedbackText}>Sve tačno! All matched.</Text>
          </Card>
          <Button
            label="Continue"
            onPress={() => onComplete({ correct: wrongAttempts === 0 })}
            testID="continue-button"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  prompt: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.blue900 },
  columns: { flexDirection: 'row', gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  item: {
    borderWidth: 2,
    borderColor: color.gray200,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: color.white,
  },
  itemSelected: { borderColor: color.blue500, backgroundColor: color.blue50 },
  itemMatched: { borderColor: color.success, backgroundColor: color.successBg, opacity: 0.7 },
  itemWrong: { borderColor: color.error, backgroundColor: color.errorBg },
  itemLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.gray800,
    textAlign: 'center',
  },
  feedbackCorrect: { backgroundColor: color.successBg, borderWidth: 0 },
  feedbackText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.gray800 },
});
