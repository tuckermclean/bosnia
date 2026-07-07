import 'react-native-gesture-handler';
import { registerGlobals } from '@livekit/react-native';
// Registers WebRTC globals LiveKit needs; must run once, before any LiveKit
// usage, so it lives at module scope in the app's entry layout.
registerGlobals();

import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, SplashScreen, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/api/queryClient';
import { useAuthStore } from '@/state/authStore';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const router = useRouter();
  const segments = useSegments();

  // Kick off token hydration once, on boot.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // The native splash screen covers the initial hydration; `app/index.tsx`
  // decides where to land via <Redirect> once `status` resolves.
  useEffect(() => {
    if (status !== 'idle' && status !== 'hydrating') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);

  // Handles subsequent auth-state changes (e.g. logging out from deep inside
  // the tabs, or a refresh-token rejection) by bouncing back to sign-in.
  // The initial-launch routing decision lives in `app/index.tsx` instead,
  // since the Stack (and thus navigation) is guaranteed to be mounted by then.
  useEffect(() => {
    if (status !== 'unauthenticated') return;
    if (segments[0] !== '(auth)') {
      router.replace('/(auth)/sign-in');
    }
  }, [status, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lesson/[id]" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="tutor" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
