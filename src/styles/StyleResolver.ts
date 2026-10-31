import type { UniversalStyle, UniversalTextStyle } from '@expo/ui';

import type {
  BoxStyleTokens,
  ControlStyleTokens,
  FieldStyleOverride,
  FormStyleConfig,
  FormThemeConfig,
  ResolvedFieldStyles,
  TypographyTokens,
} from '../types';
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from './defaultThemes';
import { defaultThemeRegistry, type ThemeRegistry } from './ThemeRegistry';

export interface FieldVisualStateFlags {
  focused?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  valid?: boolean;
  touched?: boolean;
  selected?: boolean;
  loading?: boolean;
}

export function resolvePalette(
  themeConfig: FormThemeConfig | undefined,
  activeScheme: 'light' | 'dark',
  registry: ThemeRegistry = defaultThemeRegistry
) {
  const base = activeScheme === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  const preset = themeConfig?.preset ? registry.get(themeConfig.preset) : undefined;
  const presetTokens = preset
    ? activeScheme === 'dark'
      ? preset.dark
      : preset.light
    : undefined;
  const custom = activeScheme === 'dark' ? themeConfig?.dark : themeConfig?.light;
  return {
    ...base,
    ...presetTokens,
    ...custom,
    seedColor:
      custom?.seedColor ??
      themeConfig?.seedColor ??
      presetTokens?.seedColor ??
      base.seedColor,
  };
}

export function toUniversalStyle(tokens?: BoxStyleTokens): UniversalStyle {
  if (!tokens) return {};
  return {
    ...(tokens.width !== undefined ? { width: tokens.width as UniversalStyle['width'] } : null),
    ...(tokens.height !== undefined ? { height: tokens.height as UniversalStyle['height'] } : null),
    ...(tokens.padding !== undefined ? { padding: tokens.padding } : null),
    ...(tokens.paddingHorizontal !== undefined
      ? { paddingHorizontal: tokens.paddingHorizontal }
      : null),
    ...(tokens.paddingVertical !== undefined ? { paddingVertical: tokens.paddingVertical } : null),
    ...(tokens.paddingTop !== undefined ? { paddingTop: tokens.paddingTop } : null),
    ...(tokens.paddingBottom !== undefined ? { paddingBottom: tokens.paddingBottom } : null),
    ...(tokens.paddingLeft !== undefined ? { paddingLeft: tokens.paddingLeft } : null),
    ...(tokens.paddingRight !== undefined ? { paddingRight: tokens.paddingRight } : null),
    ...(tokens.backgroundColor !== undefined ? { backgroundColor: tokens.backgroundColor } : null),
    ...(tokens.borderRadius !== undefined ? { borderRadius: tokens.borderRadius } : null),
    ...(tokens.borderWidth !== undefined ? { borderWidth: tokens.borderWidth } : null),
    ...(tokens.borderColor !== undefined ? { borderColor: tokens.borderColor } : null),
    ...(tokens.opacity !== undefined ? { opacity: tokens.opacity } : null),
  };
}

export function toUniversalTextStyle(tokens?: TypographyTokens): UniversalTextStyle {
  if (!tokens) return {};
  const textAlign: 'left' | 'right' | 'center' | undefined =
    tokens.textAlign === 'left'
      ? 'left'
      : tokens.textAlign === 'right'
        ? 'right'
        : tokens.textAlign === 'center'
          ? 'center'
          : undefined;
  return {
    ...(tokens.fontSize !== undefined ? { fontSize: tokens.fontSize } : null),
    ...(tokens.fontWeight !== undefined
      ? { fontWeight: tokens.fontWeight as UniversalTextStyle['fontWeight'] }
      : null),
    ...(tokens.fontFamily !== undefined ? { fontFamily: tokens.fontFamily } : null),
    ...(tokens.color !== undefined ? { color: tokens.color } : null),
    ...(tokens.lineHeight !== undefined ? { lineHeight: tokens.lineHeight } : null),
    ...(tokens.letterSpacing !== undefined ? { letterSpacing: tokens.letterSpacing } : null),
    ...(textAlign !== undefined ? { textAlign } : null),
  };
}

export function resolveFormStyles(
  formStyle: FormStyleConfig | undefined,
  themeConfig: FormThemeConfig | undefined,
  activeScheme: 'light' | 'dark',
  isRTL = false
) {
  const palette = resolvePalette(themeConfig, activeScheme);
  const themeStyle =
    activeScheme === 'dark' ? themeConfig?.dark?.style : themeConfig?.light?.style;

  const mergedForm: BoxStyleTokens = {
    padding: 20,
    gap: 16,
    backgroundColor: palette.background,
    ...themeStyle?.form,
    ...formStyle?.form,
  };

  const titleStyle: UniversalTextStyle = toUniversalTextStyle({
    fontSize: 24,
    fontWeight: '700',
    color: palette.textPrimary,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.title,
    ...formStyle?.title,
  });

  const descriptionStyle: UniversalTextStyle = toUniversalTextStyle({
    fontSize: 14,
    lineHeight: 20,
    color: palette.textSecondary,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.formDescription,
    ...formStyle?.formDescription,
  });

  const submitTokens: ControlStyleTokens = {
    height: 52,
    borderRadius: 12,
    backgroundColor: palette.primary,
    color: palette.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
    width: '100%',
    ...themeStyle?.submitButton,
    ...formStyle?.submitButton,
  };

  const resetTokens: ControlStyleTokens = {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'transparent',
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    ...themeStyle?.resetButton,
    ...formStyle?.resetButton,
  };

  const sectionTokens: BoxStyleTokens = {
    padding: 16,
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    ...themeStyle?.section,
    ...formStyle?.section,
  };

  const sectionHeaderStyle: UniversalTextStyle = toUniversalTextStyle({
    fontSize: 17,
    fontWeight: '600',
    color: palette.textPrimary,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.sectionHeader,
    ...formStyle?.sectionHeader,
  });

  const sectionDescriptionStyle: UniversalTextStyle = toUniversalTextStyle({
    fontSize: 13,
    color: palette.textSecondary,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.sectionDescription,
    ...formStyle?.sectionDescription,
  });

  const formErrorBox: UniversalStyle = toUniversalStyle({
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.error,
    backgroundColor: palette.errorBackground,
    ...themeStyle?.formError,
    ...formStyle?.formError,
  });

  const formErrorText: UniversalTextStyle = toUniversalTextStyle({
    fontSize: 13,
    fontWeight: '500',
    color: palette.error,
    ...themeStyle?.formError,
    ...formStyle?.formError,
  });

  const divider = {
    height: formStyle?.divider?.height ?? themeStyle?.divider?.height ?? 1,
    color: formStyle?.divider?.color ?? themeStyle?.divider?.color ?? palette.border,
    marginVertical: formStyle?.divider?.marginVertical ?? 8,
  };

  return {
    palette,
    formBox: toUniversalStyle(mergedForm),
    formGap: mergedForm.gap ?? mergedForm.spacing ?? 16,
    formAlignment: (mergedForm.alignment ?? 'start') as 'start' | 'center' | 'end',
    titleStyle,
    descriptionStyle,
    submitBox: toUniversalStyle(submitTokens),
    submitText: toUniversalTextStyle(submitTokens),
    submitVariant: (submitTokens.variant ?? 'filled') as 'filled' | 'outlined' | 'text',
    resetBox: toUniversalStyle(resetTokens),
    resetText: toUniversalTextStyle(resetTokens),
    sectionBox: toUniversalStyle(sectionTokens),
    sectionGap: sectionTokens.gap ?? 14,
    sectionHeaderStyle,
    sectionDescriptionStyle,
    formErrorBox,
    formErrorText,
    divider,
  };
}

export function resolveFieldStyles(
  formStyle: FormStyleConfig | undefined,
  themeConfig: FormThemeConfig | undefined,
  fieldOverride: FieldStyleOverride | undefined,
  state: FieldVisualStateFlags,
  activeScheme: 'light' | 'dark',
  isRTL = false,
  minTouchTarget = 44
): ResolvedFieldStyles {
  const palette = resolvePalette(themeConfig, activeScheme);
  const themeStyle =
    activeScheme === 'dark' ? themeConfig?.dark?.style : themeConfig?.light?.style;

  const baseInput: ControlStyleTokens = {
    height: Math.max(48, minTouchTarget),
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    color: palette.textPrimary,
    placeholderColor: palette.textMuted,
    cursorColor: palette.borderFocused,
    selectionColor: palette.borderFocused,
    tintColor: palette.seedColor,
    iconColor: palette.textSecondary,
    iconSize: formStyle?.icon?.size ?? 20,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.field,
    ...formStyle?.field,
    ...fieldOverride?.input,
  };

  // Layer state-dependent overrides in deterministic priority order:
  // touched -> valid -> selected -> focused -> invalid -> loading -> disabled
  const applyState = (key: keyof NonNullable<FormStyleConfig['states']>) => {
    Object.assign(
      baseInput,
      themeStyle?.states?.[key],
      formStyle?.states?.[key],
      fieldOverride?.states?.[key]
    );
  };

  if (state.touched) applyState('touched');
  if (state.valid && state.touched && !state.invalid) {
    baseInput.borderColor =
      fieldOverride?.states?.valid?.borderColor ??
      formStyle?.states?.valid?.borderColor ??
      baseInput.borderColor;
    applyState('valid');
  }
  if (state.selected) applyState('selected');
  if (state.focused) {
    baseInput.borderColor = palette.borderFocused;
    baseInput.borderWidth = Math.max(baseInput.borderWidth ?? 1, 1.5);
    applyState('focused');
  }
  if (state.invalid) {
    baseInput.borderColor = palette.error;
    applyState('invalid');
  }
  if (state.loading) {
    baseInput.opacity = 0.75;
    applyState('loading');
  }
  if (state.disabled) {
    baseInput.opacity = 0.55;
    baseInput.backgroundColor = palette.surfaceMuted;
    applyState('disabled');
  }

  const containerTokens: BoxStyleTokens = {
    width: '100%',
    ...themeStyle?.fieldContainer,
    ...formStyle?.fieldContainer,
    ...fieldOverride?.container,
  };

  const labelTokens: TypographyTokens = {
    fontSize: 14,
    fontWeight: '500',
    color: palette.textPrimary,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.label,
    ...formStyle?.label,
    ...fieldOverride?.label,
  };

  const requiredTokens: TypographyTokens = {
    fontSize: labelTokens.fontSize ?? 14,
    fontWeight: '600',
    color: palette.error,
    ...themeStyle?.requiredIndicator,
    ...formStyle?.requiredIndicator,
  };

  const descTokens: TypographyTokens = {
    fontSize: 12,
    lineHeight: 17,
    color: palette.textSecondary,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.description,
    ...themeStyle?.helperText,
    ...formStyle?.description,
    ...formStyle?.helperText,
    ...fieldOverride?.description,
  };

  const errorTokens: ControlStyleTokens = {
    fontSize: 12,
    fontWeight: '500',
    color: palette.error,
    textAlign: isRTL ? 'right' : 'left',
    ...themeStyle?.error,
    ...formStyle?.error,
    ...fieldOverride?.error,
  };

  return {
    containerStyle: toUniversalStyle(containerTokens),
    inputStyle: toUniversalStyle(baseInput),
    inputTextStyle: toUniversalTextStyle(baseInput),
    labelStyle: toUniversalTextStyle(labelTokens),
    requiredStyle: toUniversalTextStyle(requiredTokens),
    descriptionStyle: toUniversalTextStyle(descTokens),
    errorStyle: toUniversalTextStyle(errorTokens),
    errorBoxStyle: errorTokens.backgroundColor ? toUniversalStyle(errorTokens) : undefined,
    placeholderColor: baseInput.placeholderColor ?? formStyle?.placeholder?.color ?? palette.textMuted,
    cursorColor: baseInput.cursorColor ?? palette.borderFocused,
    selectionColor: baseInput.selectionColor ?? palette.borderFocused,
    tintColor: baseInput.tintColor ?? palette.seedColor,
    iconColor: state.focused
      ? (formStyle?.icon?.activeColor ?? palette.borderFocused)
      : (baseInput.iconColor ?? formStyle?.icon?.color ?? palette.textSecondary),
    iconSize: baseInput.iconSize ?? formStyle?.icon?.size ?? 20,
  };
}
