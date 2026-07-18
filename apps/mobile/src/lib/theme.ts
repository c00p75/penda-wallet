import { StyleSheet } from 'react-native';

export const colors = {
  iris: '#5B4FE8',
  irisSoft: '#E8EEFF',
  irisMuted: '#D4E0FD',
  heroStart: '#F7F8FF',
  heroMid: '#E8EEFF',
  heroEnd: '#D4E0FD',
  apricot: '#F5A962',
  apricotSoft: '#FFF0E0',
  mint: '#3DBFA0',
  mintSoft: '#E6F9F4',
  rose: '#E85B7A',
  roseSoft: '#FFE8ED',
  background: '#F7F8FF',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2FA',
  secondary: '#F0F2FA',
  text: '#1A1B2E',
  textSecondary: '#6B6D8A',
  textMuted: '#9B9DB8',
  border: '#E2E4F0',
  success: '#3DBFA0',
  danger: '#E85B7A',
  warning: '#F5A962',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  hero: { fontSize: 36, fontWeight: '700' as const, lineHeight: 42 },
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  small: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
} as const;

export const shadows = {
  soft: {
    shadowColor: '#5B4FE8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  medium: {
    shadowColor: '#1A1B2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  iris: {
    shadowColor: '#5B4FE8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
});
