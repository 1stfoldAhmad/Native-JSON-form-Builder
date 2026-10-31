import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, type KeyboardTypeOptions } from 'react-native';
import {
  Button,
  Column,
  Picker,
  Row,
  Spacer,
  Text,
  TextInput,
  type TextInputProps,
  type TextInputRef,
} from '@expo/ui';
import { getPlatformSensitiveInputModifiers } from '../core/nativePlatformBridge';

import {
  buildNativeAnimationModifiers,
  resolveAnimationTrigger,
} from '../animations/AnimationAdapter';
import { useActiveForm } from '../core/context';
import { FormIcon, NativeIconButton } from '../icons/IconRenderer';
import { useNativeTextState } from '../state/useNativeTextState';
import type { FieldRendererProps, PasswordVisibilityToggleConfig } from '../types';
import { COUNTRIES, getCountryByCode } from '../utils/countries';
import { resolveLocalizedText } from '../utils/formatting';
import { MASK_PRESETS } from '../utils/masking';
import { isSensitiveField } from '../utils/security';
import { evaluatePasswordStrength } from '../validation/passwordStrength';

type AutoCompleteProp = TextInputProps['autoComplete'];

interface TextTypePreset {
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: AutoCompleteProp;
  multiline?: boolean;
  defaultPlaceholder?: string;
  leadingIcon?: string;
}

const TEXT_TYPE_PRESETS: Record<string, TextTypePreset> = {
  text: { autoCapitalize: 'sentences' },
  firstName: {
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'given-name',
    defaultPlaceholder: 'First name',
  },
  middleName: {
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'additional-name',
    defaultPlaceholder: 'Middle name',
  },
  lastName: {
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'family-name',
    defaultPlaceholder: 'Last name',
  },
  fullName: {
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'name',
    defaultPlaceholder: 'Full name',
  },
  username: {
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'username',
    defaultPlaceholder: 'username',
  },
  email: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'email',
    defaultPlaceholder: 'name@example.com',
  },
  phone: {
    keyboardType: 'phone-pad',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'tel',
  },
  emailOrPhone: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'username',
    defaultPlaceholder: 'Email or phone number',
  },
  password: {
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'new-password',
    defaultPlaceholder: 'Enter password',
  },
  confirmPassword: {
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'new-password',
    defaultPlaceholder: 'Confirm password',
  },
  pin: {
    keyboardType: 'number-pad',
    autoCapitalize: 'none',
    autoCorrect: false,
    defaultPlaceholder: '••••',
  },
  otp: {
    keyboardType: 'number-pad',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'one-time-code',
    defaultPlaceholder: 'Enter verification code',
  },
  textarea: {
    autoCapitalize: 'sentences',
    multiline: true,
  },
  search: {
    keyboardType: 'web-search',
    autoCapitalize: 'none',
    autoCorrect: false,
    leadingIcon: 'search',
    defaultPlaceholder: 'Search...',
  },
  masked: {
    autoCapitalize: 'characters',
    autoCorrect: false,
  },
  organization: {
    autoCapitalize: 'words',
    autoComplete: 'organization',
    defaultPlaceholder: 'Company or organization',
  },
  jobTitle: {
    autoCapitalize: 'words',
    autoComplete: 'organization-title',
    defaultPlaceholder: 'Job title',
  },
  website: {
    keyboardType: 'url',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'url',
    defaultPlaceholder: 'https://example.com',
  },
  url: {
    keyboardType: 'url',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'url',
    defaultPlaceholder: 'https://',
  },
};

function resolveVisibilityToggle(
  raw: boolean | PasswordVisibilityToggleConfig | undefined
): Required<PasswordVisibilityToggleConfig> | null {
  if (!raw) return null;
  if (raw === true) {
    return {
      enabled: true,
      showIcon: 'eye',
      hideIcon: 'eye-off',
      showLabel: 'Show password',
      hideLabel: 'Hide password',
    };
  }
  if (raw.enabled === false) return null;
  return {
    enabled: true,
    showIcon: raw.showIcon ?? 'eye',
    hideIcon: raw.hideIcon ?? 'eye-off',
    showLabel: raw.showLabel ?? 'Show password',
    hideLabel: raw.hideLabel ?? 'Hide password',
  };
}

/**
 * Unified native renderer for all 20 Category A Text & Personal Information fields,
 * including secure `password` / `confirmPassword` with interactive native eye icon toggle,
 * strength indicator, `phone` with country dial code selector, `pin`, `otp`, `masked`, and `textarea`.
 */
export function TextPersonalFieldRenderer({
  field,
  fieldPath,
  value,
  onFocus,
  onBlur,
  onSubmitEditing,
  disabled,
  readOnly,
  returnKeyType,
  styles,
  locale,
  registerFocusHandle,
  getFieldValue,
}: FieldRendererProps) {
  const { store, config, renderIcon, reducedMotion } = useActiveForm();
  const inputRef = useRef<TextInputRef>(null);

  const isPasswordType =
    field.type === 'password' ||
    field.type === 'newPassword' ||
    field.type === 'confirmPassword' ||
    field.type === 'pin' ||
    field.type === 'cvv';

  const isFieldSensitive = useMemo(
    () => isSensitiveField(field, config.security),
    [field, config.security]
  );

  const visibilityConfig = useMemo(
    () => (isPasswordType ? resolveVisibilityToggle(field.visibilityToggle) : null),
    [isPasswordType, field.visibilityToggle]
  );

  // Password starts hidden (`isRevealed = false` -> `secureTextEntry = true`).
  const [isRevealed, setIsRevealed] = useState(false);

  // Country dial-code selection for `phone` fields
  const externalCountryCode = field.countryField
    ? String(getFieldValue(field.countryField) ?? '')
    : '';
  const [selectedCountry, setSelectedCountry] = useState<string>(
    externalCountryCode || field.defaultCountry || 'PK'
  );

  useEffect(() => {
    if (externalCountryCode && externalCountryCode !== selectedCountry) {
      setSelectedCountry(externalCountryCode);
    }
  }, [externalCountryCode, selectedCountry]);

  useEffect(() => {
    registerFocusHandle({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    });
    return () => registerFocusHandle(null);
  }, [registerFocusHandle]);

  const preset = TEXT_TYPE_PRESETS[field.type] ?? {};
  const resolvedMask =
    field.mask ? (MASK_PRESETS[field.mask] ?? field.mask) : undefined;

  const { nativeState, handleChangeText } = useNativeTextState({
    store,
    fieldPath,
    mask: resolvedMask,
    unmaskValue: field.unmaskValue,
  });

  const countryMeta =
    field.type === 'phone' ? getCountryByCode(selectedCountry) : undefined;

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    countryMeta?.placeholder ??
    preset.defaultPlaceholder ??
    '';

  const secureTextEntry = isPasswordType ? !isRevealed : false;
  const multiline = field.type === 'textarea' || Boolean(field.numberOfLines && field.numberOfLines > 1);
  const numberOfLines = field.numberOfLines ?? (multiline ? 4 : undefined);

  const toggleAnim = resolveAnimationTrigger(config.animations, 'visibilityToggle', {
    fieldAnimations: field.animations,
    reducedMotion,
  });
  const toggleModifiers = buildNativeAnimationModifiers(toggleAnim, isRevealed);

  const inputModifiers = useMemo(
    () => getPlatformSensitiveInputModifiers(isFieldSensitive, field.type),
    [isFieldSensitive, field.type]
  );

  const leadingIcon = field.leadingIcon ?? preset.leadingIcon;
  const prefixText =
    field.prefix ??
    (field.type === 'phone' && field.showCountryPicker === false && countryMeta
      ? countryMeta.dialCode
      : undefined);

  const showPhoneCountrySelector =
    field.type === 'phone' && field.showCountryPicker !== false && !field.countryField;

  const allowedCountryList = useMemo(() => {
    if (!field.allowedCountries?.length) return COUNTRIES;
    const upper = new Set(field.allowedCountries.map((c) => c.toUpperCase()));
    return COUNTRIES.filter((c) => upper.has(c.code));
  }, [field.allowedCountries]);

  // Password strength calculation when enabled
  const showStrength =
    field.type === 'password' &&
    (field.showStrengthIndicator === true || Boolean(field.validation?.password?.minStrengthScore));
  const currentStringValue = typeof value === 'string' ? value : '';
  const strength = useMemo(
    () =>
      showStrength
        ? evaluatePasswordStrength(currentStringValue, field.validation?.password)
        : null,
    [showStrength, currentStringValue, field.validation?.password]
  );

  if (readOnly) {
    const displayValue = isPasswordType
      ? currentStringValue
        ? '••••••••'
        : '—'
      : currentStringValue || '—';
    return (
      <Row style={styles.inputStyle} alignment="center">
        <Text textStyle={styles.inputTextStyle}>{displayValue}</Text>
      </Row>
    );
  }

  const hasDecorations =
    Boolean(showPhoneCountrySelector) ||
    Boolean(leadingIcon) ||
    Boolean(prefixText) ||
    Boolean(field.suffix) ||
    Boolean(field.trailingIcon) ||
    Boolean(visibilityConfig) ||
    (field.type === 'search' && Boolean(currentStringValue) && field.clearable !== false);

  const coreTextInput = (
    <TextInput
      ref={inputRef}
      value={nativeState}
      placeholder={placeholder}
      placeholderTextColor={styles.placeholderColor}
      editable={!disabled}
      readOnly={readOnly}
      autoFocus={field.autoFocus}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      numberOfLines={numberOfLines}
      maxLength={
        field.maxLength ??
        (field.type === 'pin' ? 6 : field.type === 'otp' ? 6 : undefined)
      }
      keyboardType={(field.keyboardType as KeyboardTypeOptions | undefined) ?? preset.keyboardType}
      autoCapitalize={
        (field.autoCapitalize as TextInputProps['autoCapitalize']) ?? preset.autoCapitalize
      }
      autoCorrect={field.autoCorrect ?? preset.autoCorrect}
      autoComplete={(field.autoComplete as AutoCompleteProp) ?? preset.autoComplete}
      returnKeyType={returnKeyType}
      selectTextOnFocus={field.selectTextOnFocus}
      cursorColor={styles.cursorColor}
      selectionColor={styles.selectionColor}
      textAlign={
        field.type === 'otp' || field.type === 'pin'
          ? 'center'
          : (styles.inputTextStyle.textAlign as TextInputProps['textAlign'])
      }
      testID={field.testID ?? `input-${fieldPath}`}
      modifiers={inputModifiers}
      style={
        hasDecorations
          ? {
              width: visibilityConfig || showPhoneCountrySelector ? '72%' : '85%',
              height: multiline ? undefined : styles.inputStyle.height,
              paddingHorizontal: 4,
              backgroundColor: 'transparent',
              borderWidth: 0,
            }
          : {
              ...styles.inputStyle,
              height: multiline ? Math.max(96, (numberOfLines ?? 4) * 24) : styles.inputStyle.height,
              paddingVertical: multiline ? 12 : undefined,
            }
      }
      textStyle={styles.inputTextStyle}
      onChangeText={handleChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      onSubmitEditing={() => onSubmitEditing()}
    />
  );

  return (
    <Column spacing={6} style={{ width: '100%' }}>
      {hasDecorations ? (
        <Row
          alignment="center"
          spacing={6}
          modifiers={toggleModifiers.length > 0 ? toggleModifiers : undefined}
          style={{
            ...styles.inputStyle,
            height: multiline ? undefined : styles.inputStyle.height,
          }}>
          {showPhoneCountrySelector ? (
            <Picker
              selectedValue={selectedCountry}
              appearance="menu"
              enabled={!disabled}
              testID={`phone-country-picker-${fieldPath}`}
              onValueChange={(nextCode) => {
                setSelectedCountry(String(nextCode));
              }}>
              {allowedCountryList.map((c) => (
                <Picker.Item
                  key={c.code}
                  label={`${c.flag} ${c.dialCode}`}
                  value={c.code}
                />
              ))}
            </Picker>
          ) : null}

          {leadingIcon ? (
            <FormIcon
              name={leadingIcon}
              size={styles.iconSize}
              color={styles.iconColor}
              renderOverride={renderIcon}
            />
          ) : null}

          {prefixText ? (
            <Text textStyle={{ ...styles.descriptionStyle, fontSize: 14, fontWeight: '500' }}>
              {prefixText}
            </Text>
          ) : null}

          {coreTextInput}

          <Spacer flexible />

          {field.suffix ? (
            <Text textStyle={{ ...styles.descriptionStyle, fontSize: 14 }}>
              {field.suffix}
            </Text>
          ) : null}

          {field.type === 'search' && currentStringValue && field.clearable !== false ? (
            <NativeIconButton
              name="clear"
              size={16}
              color={styles.iconColor}
              accessibilityLabel="Clear search"
              testID={`search-clear-${fieldPath}`}
              onPress={() => store.setValue(fieldPath, '')}
              renderOverride={renderIcon}
            />
          ) : null}

          {visibilityConfig ? (
            <NativeIconButton
              name={isRevealed ? visibilityConfig.hideIcon : visibilityConfig.showIcon}
              size={styles.iconSize}
              color={styles.iconColor}
              disabled={disabled}
              accessibilityLabel={
                isRevealed ? visibilityConfig.hideLabel : visibilityConfig.showLabel
              }
              testID={`password-toggle-${fieldPath}`}
              onPress={() => setIsRevealed((prev) => !prev)}
              renderOverride={renderIcon}
            />
          ) : field.trailingIcon ? (
            <FormIcon
              name={field.trailingIcon}
              size={styles.iconSize}
              color={styles.iconColor}
              renderOverride={renderIcon}
            />
          ) : null}
        </Row>
      ) : (
        coreTextInput
      )}

      {strength && currentStringValue.length > 0 ? (
        <Column spacing={4} style={{ width: '100%' }} testID={`password-strength-${fieldPath}`}>
          <Row spacing={4} style={{ width: '100%' }}>
            {[1, 2, 3, 4].map((seg) => (
              <Button
                key={seg}
                variant="filled"
                disabled
                style={{
                  width: '24%',
                  height: 4,
                  borderRadius: 2,
                  paddingHorizontal: 0,
                  backgroundColor:
                    strength.score >= seg ? strength.color : '#E2E8F0',
                  opacity: 1,
                }}>
                <Text textStyle={{ fontSize: 1 }}>{''}</Text>
              </Button>
            ))}
          </Row>
          <Text
            textStyle={{
              fontSize: 11,
              fontWeight: '600',
              color: strength.color,
            }}>
            {`Password strength: ${strength.label}`}
          </Text>
        </Column>
      ) : null}
    </Column>
  );
}
