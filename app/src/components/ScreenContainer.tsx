import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { color, spacing } from '@/theme/tokens';

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  backgroundColor?: string;
  padded?: boolean;
}

export function ScreenContainer({
  children,
  style,
  edges = ['top', 'bottom', 'left', 'right'],
  backgroundColor = color.gray50,
  padded = true,
}: ScreenContainerProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.base, { backgroundColor }]}>
      <View style={[styles.inner, padded && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.md,
  },
});
