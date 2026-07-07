import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, HeartsBar, ProgressBar, ScreenContainer } from '@/components';
import { useLesson } from '@/hooks/useLesson';
import { useProgress, useCompleteLesson } from '@/hooks/useProgress';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { MAX_HEARTS, PASS_RATIO } from '@/constants';
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
      // Always report the learner's real tally — even a 0/10 out-of-hearts
      // attempt — so the backend's pass-rate gating (crown/unlock only on a
      // >=60% score) sees honest numbers instead of a fudged "success" count.
      onFinish(runner.correctCount, runner.total);
    }
  }, [runner.isFinished, runner.isOutOfHearts, hasReportedFinish, runner.correctCount, runner.total, onFinish]);

  // Mirrors the backend's PASS_RATIO gate so the UI never claims success on a
  // run that won't actually crown/unlock anything server-side.
  const passed = runner.total > 0 ? runner.correctCount / runner.total >= PASS_RATIO : true;

  function handleRetry() {
    router.replace(`/lesson/${lessonId}`);
  }

  if (runner.isOutOfHearts) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={styles.summaryEmoji}>💔</Text>
          <Text style={styles.summaryTitle}>Out of hearts</Text>
          <Text style={styles.summarySubtitle}>
            You got {runner.correctCount} / {runner.total} right — not enough to pass this time. Take a
            short break, let your hearts refill, and try again.
          </Text>
          <Button label="Try Again" onPress={handleRetry} testID="retry-button" />
          <Button
            label="Back to Home"
            onPress={() => router.replace('/(tabs)/home')}
            variant="ghost"
            testID="home-button"
          />
        </View>
      </ScreenContainer>
    );
  }

  if (runner.isFinished && !passed) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={styles.summaryEmoji}>😕</Text>
          <Text style={styles.summaryTitle}>Not quite there</Text>
          <Text style={styles.summarySubtitle}>
            {runner.correctCount} / {runner.total} correct — you need at least{' '}
            {Math.ceil(runner.total * PASS_RATIO)} to pass this lesson. Give it another try!
          </Text>
          <Button label="Try Again" onPress={handleRetry} testID="retry-button" />
          <Button
            label="Back to Home"
            onPress={() => router.replace('/(tabs)/home')}
            variant="ghost"
            testID="home-button"
          />
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
          <Button label="Back to Home" onPress={() => router.replace('/(tabs)/home')} testID="home-button" />
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
