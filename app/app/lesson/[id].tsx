import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { LessonRunnerScreen } from '@/features/lesson/LessonRunnerScreen';

export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LessonRunnerScreen lessonId={id} />;
}
