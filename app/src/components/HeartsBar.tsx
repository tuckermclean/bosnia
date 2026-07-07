import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';

export interface HeartsBarProps {
  hearts: number;
  maxHearts?: number;
}

export function HeartsBar({ hearts, maxHearts = 5 }: HeartsBarProps) {
  const items = Array.from({ length: maxHearts }, (_, i) => i < hearts);

  return (
    <View style={styles.row} accessibilityLabel={`${hearts} of ${maxHearts} hearts remaining`}>
      {items.map((filled, i) => (
        <Text key={i} style={[styles.heart, !filled && styles.heartEmpty]}>
          {filled ? '♥' : '♡'}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  heart: {
    fontSize: fontSize.lg,
    color: color.heart,
    fontWeight: fontWeight.bold,
  },
  heartEmpty: {
    color: color.gray300,
  },
});
