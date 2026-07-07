import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, HeartsBar, ProgressBar, ScreenContainer } from '@/components';
import { useLesson } from '@/hooks/useLesson';
import { useProgress, useCompleteLesson } from '@/hooks/useProgress';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { MAX_HEARTS } from '@/constants';
import type { Exercise } from '@/types/api';
import { ExerciseRenderer } from './exercises';
import { useLessonRunner } from './useLessonRunner';

export interface LessonRunnerScreenProps {
  lessonId: string;
}

export function LessonRunnerScreen({ lessonId }: LessonRunnerScreenProps) {
  const router = useRouter();
  const lessonQuery = useLesson(lessonId);
  const progressQuery = useProgress();
  const completeLesson = useCompleteLesson();

  if (lessonQuery.isLoading || progressQuery.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={color.blue700} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (lessonQuery.isError || !lessonQuery.data) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn't load this lesson.</Text>
          <Button label="Go back" onPress={() => router.back()} variant="ghost" />
        </View>
      </ScreenContainer>
    );
  }

  const startingHearts = progressQuery.data?.stats.hearts ?? MAX_HEARTS;

  return (
    <LessonRunnerBody
      lessonId={lessonId}
      exercises={lessonQuery.data.exercises}
      startingHearts={startingHearts}
      onFinish={(correctCount, total) => {
        completeLesson.mutate({ lessonId, correctCount, total });
      }}
    />
  );
}

function LessonRunnerBody({
  lessonId,
  exercises,
  startingHearts,
  onFinish,
}: {
  lessonId: string;
  exercises: Exercise[];
  startingHearts: number;
  onFinish: (correctCount: number, total: number) => void;
}) {
  const router = useRouter();
  const runner = useLessonRunner(exercises ?? [], startingHearts);
  const [hasReportedFinish, setHasReportedFinish] = React.useState(false);

  React.useEffect(() => {
    if ((runner.isFinished || runner.isOutOfHearts) && !hasReportedFinish) {
      setHasReportedFinish(true);
      onFinish(runner.correctCount, runner.total);
    }
  }, [runner.isFinished, runner.isOutOfHearts, hasReportedFinish, runner.correctCount, runner.total, onFinish]);

  if (runner.isOutOfHearts) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={styles.summaryEmoji}>💔</Text>
          <Text style={styles.summaryTitle}>Out of hearts</Text>
          <Text style={styles.summarySubtitle}>
            Take a short break and your hearts will refill. You got {runner.correctCount} right.
          </Text>
          <Button label="Back to Home" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </ScreenContainer>
    );
  }

  if (runner.isFinished) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={styles.summaryEmoji}>🌼</Text>
          <Text style={styles.summaryTitle}>Lesson complete!</Text>
          <Text style={styles.summarySubtitle}>
            {runner.correctCount} / {runner.total} correct
          </Text>
          <Button label="Back to Home" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exit lesson"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <ProgressBar progress={runner.progress} style={styles.progressBar} />
        <HeartsBar hearts={runner.hearts} />
      </View>

      <View style={styles.body}>
        {runner.currentExercise ? (
          <ExerciseRenderer
            key={`${lessonId}-${runner.currentExercise.id}-${runner.currentIndex}`}
            exercise={runner.currentExercise}
            onComplete={runner.handleComplete}
          />
        ) : (
          <Card padded>
            <Text>No exercises in this lesson yet.</Text>
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  errorText: { fontSize: fontSize.md, color: color.gray600 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  closeIcon: { fontSize: fontSize.lg, color: color.gray500 },
  progressBar: { flex: 1 },
  body: { flex: 1, paddingTop: spacing.sm },
  summaryEmoji: { fontSize: 64 },
  summaryTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.blue900 },
  summarySubtitle: { fontSize: fontSize.md, color: color.gray600, textAlign: 'center' },
});
