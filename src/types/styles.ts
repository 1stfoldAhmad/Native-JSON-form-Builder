export type FontWeightToken =
  | 'normal'
  | 'bold'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | (string & {});

export type AlignmentToken = 'start' | 'center' | 'end' | (string & {});
export type TextAlignToken = 'left' | 'right' | 'center' | 'auto' | 'justify' | (string & {});
export type DimensionToken = number | `${number}%` | (string & {});

/**
 * Box/container style tokens mapped cleanly onto `@expo/ui` UniversalStyle
 * plus platform-specific SwiftUI / Jetpack Compose modifiers.
 */
export interface BoxStyleTokens {
  width?: DimensionToken;
  height?: DimensionToken;
  minHeight?: number;
  maxWidth?: number;
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  gap?: number;
  spacing?: number;
  alignment?: AlignmentToken;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  elevation?: number;
  shadowColor?: string;
  shadowRadius?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

/**
 * Typography tokens mapped onto `@expo/ui` UniversalTextStyle.
 */
export interface TypographyTokens {
  fontSize?: number;
  fontWeight?: FontWeightToken;
  fontFamily?: string;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: TextAlignToken;
}

/**
 * Combined box + typography tokens for controls such as inputs, buttons, and chips.
 */
export interface ControlStyleTokens extends BoxStyleTokens, TypographyTokens {
  placeholderColor?: string;
  cursorColor?: string;
  selectionColor?: string;
  tintColor?: string;
  iconColor?: string;
  iconSize?: number;
  variant?: 'filled' | 'outlined' | 'text' | (string & {});
}

/**
 * Interactive state-dependent style overrides.
 */
export interface FieldStateStyleTokens {
  focused?: Partial<ControlStyleTokens>;
  disabled?: Partial<ControlStyleTokens>;
  invalid?: Partial<ControlStyleTokens>;
  valid?: Partial<ControlStyleTokens>;
  touched?: Partial<ControlStyleTokens>;
  selected?: Partial<ControlStyleTokens>;
  loading?: Partial<ControlStyleTokens>;
}

/**
 * Complete form-level JSON style configuration.
 * Never requires developers to write React Native StyleSheets for ordinary forms.
 */
export interface FormStyleConfig {
  /** Outer form container styles (background, width, padding, alignment, border, radius, gap). */
  form?: BoxStyleTokens;
  /** Form header title typography. */
  title?: TypographyTokens;
  /** Form header description typography. */
  formDescription?: TypographyTokens;
  /** Wrapper around each field (label + input + helper + error). */
  fieldContainer?: BoxStyleTokens;
  /** Default input/control box & text styles. */
  field?: ControlStyleTokens;
  /** Field label typography. */
  label?: TypographyTokens;
  /** Required asterisk Typography. */
  requiredIndicator?: TypographyTokens;
  /** Placeholder text styling. */
  placeholder?: Pick<TypographyTokens, 'color' | 'fontSize'>;
  /** Field description / helper text typography. */
  description?: TypographyTokens;
  /** Helper text alias. */
  helperText?: TypographyTokens;
  /** Field-level validation error message typography & box. */
  error?: ControlStyleTokens;
  /** Form-level error banner styling. */
  formError?: ControlStyleTokens;
  /** Interactive state overrides (focused, disabled, invalid, valid, touched, selected, loading). */
  states?: FieldStateStyleTokens;

  /** Control-specific styles. */
  checkbox?: ControlStyleTokens;
  radio?: ControlStyleTokens;
  switch?: ControlStyleTokens;
  picker?: ControlStyleTokens;
  slider?: ControlStyleTokens;
  chip?: ControlStyleTokens;
  icon?: {
    size?: number;
    color?: string;
    activeColor?: string;
    buttonPadding?: number;
  };
  uploadButton?: ControlStyleTokens;
  submitButton?: ControlStyleTokens;
  resetButton?: ControlStyleTokens;
  stepButton?: ControlStyleTokens;

  /** Section & structural styles. */
  section?: BoxStyleTokens;
  sectionHeader?: TypographyTokens;
  sectionDescription?: TypographyTokens;
  divider?: {
    height?: number;
    color?: string;
    marginVertical?: number;
  };
}

/**
 * Per-field style override block allowing individual fields to customize any token.
 */
export interface FieldStyleOverride {
  container?: BoxStyleTokens;
  input?: ControlStyleTokens;
  label?: TypographyTokens;
  description?: TypographyTokens;
  error?: ControlStyleTokens;
  states?: FieldStateStyleTokens;
}

/**
 * Theme appearance configuration (light/dark/system + seedColor + palette overrides).
 */
export interface FormThemeTokens {
  seedColor?: string;
  background?: string;
  surface?: string;
  surfaceMuted?: string;
  textPrimary?: string;
  textSecondary?: string;
  textMuted?: string;
  border?: string;
  borderFocused?: string;
  primary?: string;
  primaryForeground?: string;
  error?: string;
  errorBackground?: string;
  success?: string;
  warning?: string;
  style?: FormStyleConfig;
}

export interface FormThemeConfig {
  /** Named registered theme preset (e.g., `'default'`, `'compact'`, `'high-contrast'`, `'finance-enterprise'`). */
  preset?: string;
  /** Density scale affecting vertical spacing and input heights. */
  density?: 'compact' | 'comfortable' | 'spacious';
  /** Appearance mode: 'system' follows device theme; 'light' or 'dark' forces scheme. */
  mode?: 'light' | 'dark' | 'system' | (string & {});
  /** Primary seed color passed to `@expo/ui` Host for Material 3 / SwiftUI tint derivation. */
  seedColor?: string;
  /** Light theme token overrides. */
  light?: FormThemeTokens;
  /** Dark theme token overrides. */
  dark?: FormThemeTokens;
}
