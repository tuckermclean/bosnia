import React, { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components';
import { isVoiceTutorAvailable } from '@/features/tutor/availability';
import { useCourses } from '@/hooks/useCourses';
import { deriveLearnerLevel } from '@/features/tutor/level';
import { color, fontSize, spacing } from '@/theme/tokens';

// LiveKit (and the native WebRTC module it needs) is loaded ONLY via this
// dynamic import, never statically — Expo Go doesn't ship native WebRTC, and
// expo-router eagerly requires every static import reachable from `app/` to
// build its route table. A dynamic `import()` keeps LiveKit out of that
// eager boot bundle entirely; see `src/features/tutor/availability.ts`.
const VoiceCallLive = React.lazy(() => import('@/features/tutor/VoiceCallLive'));

export default function TutorCallScreen() {
  const router = useRouter();
  const coursesQuery = useCourses();

  if (!isVoiceTutorAvailable()) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.hint}>Voice tutor needs a development build</Text>
          <Button label="Back" onPress={() => router.back()} variant="ghost" />
        </View>
      </View>
    );
  }

  // Wait for course/progress data so the very first tutor session request
  // carries the learner's real level instead of a throwaway "A1" guess that
  // would need an immediate re-fetch once courses load.
  if (coursesQuery.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={color.gold500} size="large" />
        </View>
      </View>
    );
  }

  const level = deriveLearnerLevel(coursesQuery.data);

  return (
    <View style={styles.container}>
      <Suspense
        fallback={
          <View style={styles.center}>
            <ActivityIndicator color={color.gold500} size="large" />
          </View>
        }
      >
        <VoiceCallLive level={level} onEnd={() => router.back()} />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.blue900,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  hint: {
    color: color.white,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
});
