import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';
import { MAX_CROWN_LEVEL } from '@/constants';
import type { SkillSummary } from '@/types/api';

export interface SkillNodeProps {
  skill: SkillSummary;
  /** Horizontal offset for the zig-zag path layout: -1 (left), 0 (center), 1 (right). */
  lane: -1 | 0 | 1;
  onPress: () => void;
}

const NODE_SIZE = 76;
const LANE_OFFSET = 56;

export function SkillNode({ skill, lane, onPress }: SkillNodeProps) {
  const isMastered = skill.crownLevel >= MAX_CROWN_LEVEL;

  return (
    <View style={[styles.laneWrap, { transform: [{ translateX: lane * LANE_OFFSET }] }]}>
      <Pressable
        testID={`skill-node-${skill.id}`}
        onPress={onPress}
        disabled={!skill.unlocked}
        accessibilityRole="button"
        accessibilityState={{ disabled: !skill.unlocked }}
        accessibilityLabel={`${skill.titleEn}${skill.unlocked ? '' : ' (locked)'}`}
        style={({ pressed }) => [
          styles.node,
          skill.unlocked ? styles.nodeUnlocked : styles.nodeLocked,
          isMastered && styles.nodeMastered,
          pressed && skill.unlocked && styles.nodePressed,
        ]}
      >
        <Text style={styles.nodeIcon}>{skill.unlocked ? (isMastered ? '👑' : '🌼') : '🔒'}</Text>
      </Pressable>
      <Text style={styles.label} numberOfLines={2}>
        {skill.titleEn}
      </Text>
      {skill.unlocked && skill.crownLevel > 0 ? (
        <Text style={styles.crownLevel}>
          Level {skill.crownLevel}/{MAX_CROWN_LEVEL}
        </Text>
      ) : null}
      {skill.reviewStatus === 'unreviewed' ? <Text style={styles.unreviewedTag}>unreviewed content</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  laneWrap: {
    alignItems: 'center',
    gap: spacing.xxs,
    marginVertical: spacing.sm,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  nodeUnlocked: {
    backgroundColor: color.gold500,
    borderColor: color.gold700,
  },
  nodeMastered: {
    backgroundColor: color.gold400,
    borderColor: color.gold600,
  },
  nodeLocked: {
    backgroundColor: color.gray200,
    borderColor: color.gray300,
  },
  nodePressed: {
    transform: [{ scale: 0.95 }],
  },
  nodeIcon: { fontSize: 32 },
  label: {
    maxWidth: 100,
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.blue900,
  },
  crownLevel: {
    fontSize: fontSize.xs,
    color: color.gold600,
    fontWeight: fontWeight.medium,
  },
  unreviewedTag: {
    fontSize: 10,
    color: color.gray400,
    fontStyle: 'italic',
  },
});
