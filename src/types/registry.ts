import type { ComponentType, ReactElement } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { UniversalStyle, UniversalTextStyle } from '@expo/ui';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { FieldConfig, FieldOption, FormFileAsset } from './fields';
import type { FormValues } from './state';

/**
 * Resolved native styles passed down to field renderers.
 */
export interface ResolvedFieldStyles {
  containerStyle: UniversalStyle;
  inputStyle: UniversalStyle;
  inputTextStyle: UniversalTextStyle;
  labelStyle: UniversalTextStyle;
  requiredStyle: UniversalTextStyle;
  descriptionStyle: UniversalTextStyle;
  errorStyle: UniversalTextStyle;
  errorBoxStyle?: UniversalStyle;
  placeholderColor: string;
  cursorColor: string;
  selectionColor: string;
  tintColor: string;
  iconColor: string;
  iconSize: number;
}

export interface FocusableFieldHandle {
  focus: () => void;
  blur?: () => void;
}

/**
 * Props passed by ExpoForm to every field renderer in FieldRegistry (built-in and custom).
 */
export interface FieldRendererProps<TValue = unknown> {
  /** Field JSON configuration object. */
  field: FieldConfig;
  /** Full dot-path in form values (e.g. 'email' or 'addresses.0.city'). */
  fieldPath: string;
  /** Current value of this field. */
  value: TValue;
  /** Update this field's value in the form store. */
  onChange: (nextValue: TValue) => void;
  /** Notify form controller that field gained focus. */
  onFocus: () => void;
  /** Notify form controller that field lost focus (triggers onBlur validation when configured). */
  onBlur: () => void;
  /** Notify keyboard navigation controller when user taps Return/Next/Submit. */
  onSubmitEditing: () => void;

  /** Current error message (only populated when error should be visible, or raw error available via `rawError`). */
  error?: string;
  rawError?: string;

  /** Computed runtime flags. */
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  focused: boolean;
  touched: boolean;
  dirty: boolean;
  validating: boolean;

  /** Keyboard return-key hint computed by KeyboardLayoutAdapter. */
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send' | 'default';

  /** Selected file assets (for upload fields). */
  files?: FormFileAsset[];
  onFilesChange?: (files: FormFileAsset[]) => void;

  /** Resolved theme + JSON + state styles for `@expo/ui` components. */
  styles: ResolvedFieldStyles;

  /** Active locale & RTL flag. */
  locale: string;
  isRTL: boolean;

  /** Register imperative focus/blur handle so `formRef.current.focus(name)` and invalid-field focusing work. */
  registerFocusHandle: (handle: FocusableFieldHandle | null) => void;

  /** Accessor for reading/updating sibling fields (e.g. phone country field, confirmPassword, repeater). */
  getFieldValue: (path: string) => unknown;
  setFieldValue: (path: string, val: unknown) => void;
}

export type FieldComponent<TValue = any> = ComponentType<FieldRendererProps<TValue>>;

export interface FieldRegistrationEntry {
  type: string;
  component: FieldComponent;
  category?:
    | 'text'
    | 'numeric'
    | 'selection'
    | 'datetime'
    | 'location'
    | 'upload'
    | 'structural'
    | 'custom';
  /** Whether the field renderer renders its own label/wrapper instead of standard FieldWrapper. */
  isStructural?: boolean;
  /** Whether the field holds sensitive credentials (passwords, PINs, OTPs). */
  isSensitive?: boolean;
  /** Default empty value when initializing or resetting. */
  defaultEmptyValue?: unknown;
}

/**
 * Query context passed to registered remote/dynamic data source providers.
 */
export interface DataSourceQueryContext {
  query?: string;
  page?: number;
  pageSize?: number;
  dependencies: Record<string, unknown>;
  params?: Record<string, unknown>;
  locale: string;
  signal?: AbortSignal;
}

export interface DataSourceResult {
  options: FieldOption[];
  hasMore?: boolean;
  nextPage?: number;
  totalCount?: number;
}

export type DataSourceProvider = (
  context: DataSourceQueryContext
) => Promise<FieldOption[] | DataSourceResult> | FieldOption[] | DataSourceResult;

/**
 * Async field validator signature (returns `true | null | undefined` when valid, or an error string / `false` when invalid).
 */
export type AsyncFieldValidator = (context: {
  field: string;
  value: unknown;
  values: FormValues;
  params?: Record<string, unknown>;
  locale: string;
  signal?: AbortSignal;
}) => Promise<boolean | string | null | undefined>;

/**
 * Named action handler signature (e.g. custom upload handler, custom button action, or submit action).
 */
export type ActionHandler = (context: {
  actionId: string;
  values: FormValues;
  params?: Record<string, unknown>;
  setValue: (field: string, value: unknown) => void;
  setError: (field: string, message: string) => void;
}) => void | Promise<unknown>;

/**
 * Custom calculator function for `computed` fields when `calculatorId` is specified.
 */
export type ComputedCalculator = (values: FormValues, field: FieldConfig) => unknown;

/**
 * Pluggable key-value draft persistence adapter (compatible with AsyncStorage, MMKV wrappers, or Web localStorage).
 */
export interface DraftStorageAdapter {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

/**
 * Platform icon mapping entry for IconRegistry.
 */
export interface PlatformIconDefinition {
  ios?: SFSymbol;
  android?: ImageSourcePropType;
  glyph?: string;
  label?: string;
}

export type IconRenderOverride = (props: {
  name: string;
  size: number;
  color: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
}) => ReactElement | null;
