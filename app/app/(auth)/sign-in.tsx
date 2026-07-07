import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button, TextField } from '@/components';
import { useAuthStore } from '@/state/authStore';
import { ApiError } from '@/api/client';
import { color, fontSize, fontWeight, spacing } from '@/theme/tokens';

export default function SignInScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.mascot}>🌼</Text>
          <Text style={styles.title}>Ljiljan</Text>
          <Text style={styles.subtitle}>Learn Bosnian, one lily at a time.</Text>
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
            testID="password-input"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label="Sign in"
            onPress={handleSubmit}
            loading={loading}
            disabled={!email || !password}
            testID="sign-in-button"
          />
        </View>

        <Link href="/(auth)/sign-up" asChild>
          <Text style={styles.link}>New here? Create an account</Text>
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
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: color.white },
  subtitle: { fontSize: fontSize.sm, color: color.gold100 },
  form: { gap: spacing.md },
  error: { color: color.error, fontSize: fontSize.sm, textAlign: 'center' },
  link: {
    textAlign: 'center',
    color: color.gold300,
    fontWeight: fontWeight.medium,
    fontSize: fontSize.sm,
  },
});
