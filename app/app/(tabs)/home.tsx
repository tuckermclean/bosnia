import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HeartsBar, ScreenContainer, XpBadge, StreakBadge } from '@/components';
import { useCourses } from '@/hooks/useCourses';
import { useProgress } from '@/hooks/useProgress';
import { SkillPath } from '@/features/home/SkillPath';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { MAX_HEARTS } from '@/constants';
import type { SkillSummary } from '@/types/api';

export default function HomeScreen() {
  const router = useRouter();
  const coursesQuery = useCourses();
  const progressQuery = useProgress();

  const isLoading = coursesQuery.isLoading || progressQuery.isLoading;
  const isError = coursesQuery.isError || progressQuery.isError;

  // MVP content is a single A1 course; index [0] per the backend contract.
  const course = coursesQuery.data?.[0];
  const stats = progressQuery.data?.stats;

  function handleSelectSkill(skill: SkillSummary) {
    if (!skill.unlocked) return;
    const firstLesson = skill.lessons[0];
    if (firstLesson) {
      router.push(`/lesson/${firstLesson.id}`);
    }
  }

  return (
    <ScreenContainer padded={false} backgroundColor={color.gray50}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Dobrodošli 👋</Text>
          <Text style={styles.greetingSub}>Welcome back</Text>
        </View>
        <View style={styles.headerBadges}>
          {stats ? <StreakBadge streak={stats.streak} /> : null}
          {stats ? <XpBadge xp={stats.xp} /> : null}
        </View>
      </View>
      {stats ? (
        <View style={styles.heartsRow}>
          <HeartsBar hearts={stats.hearts} maxHearts={MAX_HEARTS} />
        </View>
      ) : null}

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={color.blue700} size="large" />
        </View>
      )}

      {isError && !isLoading && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn't load your course. Pull to refresh soon.</Text>
        </View>
      )}

      {course && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {course.units.map((unit) => (
            <SkillPath key={unit.id} unit={unit} onSelectSkill={handleSelectSkill} />
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  greeting: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.blue900 },
  greetingSub: { fontSize: fontSize.sm, color: color.gray500 },
  headerBadges: { flexDirection: 'row', gap: spacing.xs },
  heartsRow: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorText: { color: color.gray500, textAlign: 'center' },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
});
