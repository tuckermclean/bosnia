import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/state/authStore';
import { color } from '@/theme/tokens';

/**
 * Initial route: waits for the auth store to hydrate (reading tokens from
 * expo-secure-store, validating with `GET /auth/me`), then redirects into
 * the signed-in tab flow or the sign-in screen. Using `<Redirect>` here
 * (rather than an imperative `router.replace` in the root layout) avoids
 * racing the very first render, before the navigator is fully mounted.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);

  if (status === 'idle' || status === 'hydrating') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={color.gold400} size="large" />
      </View>
    );
  }

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}

const styles = {
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: color.blue900,
  },
};
