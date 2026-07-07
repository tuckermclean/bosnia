import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { SkillNode } from './SkillNode';
import type { SkillSummary, UnitSummary } from '@/types/api';

export interface SkillPathProps {
  unit: UnitSummary;
  onSelectSkill: (skill: SkillSummary) => void;
}

const LANE_PATTERN: Array<-1 | 0 | 1> = [0, 1, 0, -1];

export function SkillPath({ unit, onSelectSkill }: SkillPathProps) {
  return (
    <View style={styles.container}>
      <View style={styles.unitHeader}>
        <Text style={styles.unitLevel}>{unit.level}</Text>
        <Text style={styles.unitTitle}>{unit.title}</Text>
        <Text style={styles.unitTitleEn}>{unit.titleEn}</Text>
        {unit.theme ? <Text style={styles.unitTheme}>{unit.theme}</Text> : null}
      </View>

      <View style={styles.path}>
        {unit.skills.map((skill, i) => (
          <SkillNode
            key={skill.id}
            skill={skill}
            lane={LANE_PATTERN[i % LANE_PATTERN.length] ?? 0}
            onPress={() => onSelectSkill(skill)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  unitHeader: {
    backgroundColor: color.blue700,
    borderRadius: 18,
    padding: spacing.md,
    gap: 2,
  },
  unitLevel: {
    color: color.gold300,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.xs,
    letterSpacing: 1,
  },
  unitTitle: { color: color.white, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  unitTitleEn: { color: color.blue100, fontSize: fontSize.sm },
  unitTheme: { color: color.blue100, fontSize: fontSize.xs, marginTop: spacing.xxs },
  path: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
