import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, fontSize, radius, spacing } from '@/theme/tokens';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={color.gray400}
        style={[styles.input, Boolean(error) && styles.inputError, style]}
        {...inputProps}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xxs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: color.gray200 },
  input: {
    borderWidth: 2,
    borderColor: color.gray200,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    backgroundColor: color.white,
    color: color.black,
  },
  inputError: {
    borderColor: color.error,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: color.error,
  },
});
