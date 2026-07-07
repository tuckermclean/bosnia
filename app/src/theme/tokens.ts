/**
 * Ljiljan design tokens.
 *
 * Brand identity: the golden lily (zlatni ljiljan), a Bosnian national symbol —
 * warm gold/amber as the primary brand color, paired with the deep blue of the
 * Bosnian flag and clean white. Deliberately NOT Duolingo's green/owl palette.
 */

export const color = {
  // Brand
  gold50: '#FDF6E7',
  gold100: '#FBEBC7',
  gold300: '#F0C868',
  gold400: '#E8B23F',
  gold500: '#DE9F1F', // primary brand gold
  gold600: '#B87F14',
  gold700: '#8F620F',

  blue50: '#EAF0FB',
  blue100: '#CBD9F0',
  blue300: '#5D7FB9',
  blue500: '#1E407F',
  blue700: '#123061', // deep Bosnian flag blue
  blue900: '#0A2340',

  white: '#FFFFFF',
  black: '#14171A',

  // Neutrals
  gray50: '#F7F7F8',
  gray100: '#EDEEF0',
  gray200: '#DEE1E5',
  gray300: '#C3C7CE',
  gray400: '#9AA0AA',
  gray500: '#717783',
  gray600: '#4F5560',
  gray700: '#363B44',
  gray800: '#22262D',

  // Feedback (generic UI semantics, not brand identity)
  success: '#3D9A5C',
  successBg: '#E5F5EA',
  error: '#C6483D',
  errorBg: '#FBEAE8',
  warning: '#D98A1E',

  // Hearts
  heart: '#D64550',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 34,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '600' as const,
  bold: '800' as const,
};

export const shadow = {
  card: {
    shadowColor: color.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  raised: {
    shadowColor: color.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 5,
  },
} as const;

export const theme = { color, spacing, radius, fontSize, fontWeight, shadow };
export type Theme = typeof theme;
