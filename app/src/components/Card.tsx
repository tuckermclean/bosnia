import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, radius, shadow, spacing } from '@/theme/tokens';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, style, padded = true, elevated = true }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        padded && styles.padded,
        elevated && shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.gray100,
  },
  padded: {
    padding: spacing.md,
  },
});
