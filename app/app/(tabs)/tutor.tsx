import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, ScreenContainer } from '@/components';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';

/**
 * Tab landing screen for the voice tutor. The live call itself runs as a
 * full-screen modal at the top-level `/tutor` route (see `app/tutor.tsx`) so
 * it can hide the tab bar and own the whole screen during the call.
 */
export default function TutorEntryScreen() {
  const router = useRouter();

  return (
    <ScreenContainer backgroundColor={color.gray50}>
      <View style={styles.container}>
        <Text style={styles.mascot}>🌼</Text>
        <Text style={styles.title}>Talk with Ljilja</Text>
        <Text style={styles.subtitle}>
          Have a live, spoken conversation in Bosnian. Ljilja listens, replies out loud, and adapts
          to your level — you can even interrupt her mid-sentence.
        </Text>

        <Card style={styles.tipCard} padded>
          <Text style={styles.tipText}>
            🎧 Find a quiet spot and use headphones for the best experience. The call is
            Bosnian-only — Ljilja will simplify her language for beginners instead of switching to
            English.
          </Text>
        </Card>

        <Button
          label="Start conversation"
          onPress={() => router.push('/tutor')}
          testID="start-tutor-button"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  mascot: { fontSize: 72 },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.blue900 },
  subtitle: { fontSize: fontSize.md, color: color.gray600, textAlign: 'center' },
  tipCard: { backgroundColor: color.gold50, borderWidth: 0 },
  tipText: { fontSize: fontSize.sm, color: color.gray700 },
});
