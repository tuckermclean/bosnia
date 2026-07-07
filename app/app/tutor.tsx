import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceCall } from '@/features/tutor/VoiceCall';
import { color } from '@/theme/tokens';

export default function TutorCallScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <VoiceCall onEnd={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.blue900,
  },
});
