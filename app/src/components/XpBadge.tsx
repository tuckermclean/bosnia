import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';

export interface XpBadgeProps {
  xp: number;
}

export function XpBadge({ xp }: XpBadgeProps) {
  return (
    <View style={styles.badge} accessibilityLabel={`${xp} experience points`}>
      <Text style={styles.icon}>⚡</Text>
      <Text style={styles.text}>{xp}</Text>
    </View>
  );
}

export interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  return (
    <View style={styles.badge} accessibilityLabel={`${streak} day streak`}>
      <Text style={styles.icon}>🔥</Text>
      <Text style={styles.text}>{streak}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: color.gold50,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  icon: {
    fontSize: fontSize.sm,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: color.blue900,
  },
});
