import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceCall } from '@/features/tutor/VoiceCall';
import { useCourses } from '@/hooks/useCourses';
import { deriveLearnerLevel } from '@/features/tutor/level';
import { color } from '@/theme/tokens';

export default function TutorCallScreen() {
  const router = useRouter();
  const coursesQuery = useCourses();

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
      <VoiceCall level={level} onEnd={() => router.back()} />
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
  },
});
