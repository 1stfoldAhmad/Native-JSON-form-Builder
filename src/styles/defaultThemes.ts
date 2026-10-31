import type { FormThemeTokens } from '../types';

export const DEFAULT_LIGHT_THEME: Required<Omit<FormThemeTokens, 'style'>> = {
  seedColor: '#2563EB',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#CBD5E1',
  borderFocused: '#2563EB',
  primary: '#171717',
  primaryForeground: '#FFFFFF',
  error: '#DC2626',
  errorBackground: '#FEF2F2',
  success: '#16A34A',
  warning: '#D97706',
};

export const DEFAULT_DARK_THEME: Required<Omit<FormThemeTokens, 'style'>> = {
  seedColor: '#60A5FA',
  background: '#09090B',
  surface: '#18181B',
  surfaceMuted: '#27272A',
  textPrimary: '#F8FAFC',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  border: '#3F3F46',
  borderFocused: '#60A5FA',
  primary: '#F8FAFC',
  primaryForeground: '#09090B',
  error: '#F87171',
  errorBackground: '#450A0A',
  success: '#4ADE80',
  warning: '#FBBF24',
};
