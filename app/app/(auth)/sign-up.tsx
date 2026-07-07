import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button, TextField } from '@/components';
import { useAuthStore } from '@/state/authStore';
import { ApiError } from '@/api/client';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';

export default function SignUpScreen() {
  const register = useAuthStore((s) => s.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < 8;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create your account. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.mascot}>🌼</Text>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Start your Bosnian journey with Ljilja.</Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <TextField
            label="Password"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            error={passwordTooShort ? 'At least 8 characters' : undefined}
            testID="password-input"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label="Create account"
            onPress={handleSubmit}
            loading={loading}
            disabled={!email || password.length < 8}
            testID="sign-up-button"
          />
        </View>

        <Link href="/(auth)/sign-in" asChild>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  brand: { alignItems: 'center', gap: spacing.xxs },
  mascot: { fontSize: 64 },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: color.white, textAlign: 'center' },
  subtitle: { fontSize: fontSize.sm, color: color.gold100, textAlign: 'center' },
  form: { gap: spacing.md },
  error: { color: color.error, fontSize: fontSize.sm, textAlign: 'center' },
  link: {
    textAlign: 'center',
    color: color.gold300,
    fontWeight: fontWeight.medium,
    fontSize: fontSize.sm,
  },
});
