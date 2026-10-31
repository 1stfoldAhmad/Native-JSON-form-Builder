import { useMemo, type ReactNode } from 'react';
import { Column, Row, Spacer, Text } from '@expo/ui';

import {
  buildNativeAnimationModifiers,
  resolveAnimationTrigger,
} from '../animations/AnimationAdapter';
import { useActiveForm } from '../core/context';
import { getPlatformFieldA11yModifiers } from '../core/nativePlatformBridge';
import {
  buildFieldScrollTargetModifiers,
  getFieldScrollAnchorId,
} from '../keyboard/KeyboardLayoutAdapter';
import type { FieldConfig, ResolvedFieldStyles } from '../types';
import { resolveLocalizedText } from '../utils/formatting';

export interface FieldWrapperProps {
  field: FieldConfig;
  fieldPath: string;
  required: boolean;
  focused: boolean;
  validating: boolean;
  error?: string;
  styles: ResolvedFieldStyles;
  suppressLabel?: boolean;
  children: ReactNode;
}

/**
 * Native field chrome around every non-structural control:
 * - Localized label + required indicator
 * - Native scroll-to-field anchor (`id` on iOS, `testID` on Android/Web)
 * - Screen-reader accessibility modifiers (iOS SwiftUI & Android Jetpack Compose)
 * - Native animation modifiers (`fieldReveal` / `focus` / `error`)
 * - Supporting description / helper text & error message without layout jumps
 */
export function FieldWrapper({
  field,
  fieldPath,
  required,
  focused,
  validating,
  error,
  styles,
  suppressLabel = false,
  children,
}: FieldWrapperProps) {
  const { config, locale, reducedMotion } = useActiveForm();
  const translations = config.i18n?.translations;

  const labelText = resolveLocalizedText(field.label, locale, translations);
  const descriptionText = resolveLocalizedText(field.description, locale, translations);
  const helperText = resolveLocalizedText(field.helperText, locale, translations);
  const requiredSymbol = config.accessibility?.requiredIndicatorText ?? '*';

  const labelPosition = config.layout?.labelPosition ?? 'top';
  const showTopLabel =
    !suppressLabel && Boolean(labelText) && labelPosition !== 'hidden';

  const a11yLabel = useMemo(() => {
    const base = field.accessibility?.label ?? labelText ?? fieldPath;
    const reqSuffix =
      required && config.accessibility?.announceRequiredFields !== false ? ', required' : '';
    return `${base}${reqSuffix}`;
  }, [
    field.accessibility?.label,
    labelText,
    fieldPath,
    required,
    config.accessibility?.announceRequiredFields,
  ]);

  const a11yHint = field.accessibility?.hint ?? helperText ?? descriptionText;

  const wrapperModifiers = useMemo(() => {
    const mods: any[] = [...buildFieldScrollTargetModifiers(fieldPath)];

    const focusAnim = resolveAnimationTrigger(config.animations, 'focus', {
      fieldAnimations: field.animations,
      reducedMotion,
    });
    mods.push(
      ...buildNativeAnimationModifiers(focusAnim, focused, {
        preventLayoutJumps: config.animations?.preventLayoutJumps ?? true,
      })
    );

    mods.push(
      ...getPlatformFieldA11yModifiers({
        label: a11yLabel,
        hint: a11yHint,
        error,
        validating,
      })
    );

    return mods;
  }, [
    fieldPath,
    config.animations,
    field.animations,
    reducedMotion,
    focused,
    a11yLabel,
    a11yHint,
    error,
    validating,
  ]);

  const errorAnim = resolveAnimationTrigger(config.animations, 'error', {
    fieldAnimations: field.animations,
    reducedMotion,
  });
  const errorModifiers = buildNativeAnimationModifiers(errorAnim, Boolean(error), {
    preventLayoutJumps: config.animations?.preventLayoutJumps ?? true,
  });

  return (
    <Column
      spacing={6}
      modifiers={wrapperModifiers}
      style={{
        width: '100%',
        ...styles.containerStyle,
      }}
      testID={field.testID ?? getFieldScrollAnchorId(fieldPath)}
    >
      {showTopLabel ? (
        <Row spacing={4} alignment="center" style={{ width: '100%' }}>
          <Text textStyle={styles.labelStyle}>{labelText}</Text>
          {required ? (
            <Text
              testID={`required-indicator-${fieldPath}`}
              textStyle={styles.requiredStyle}
            >
              {requiredSymbol}
            </Text>
          ) : null}
          {validating ? (
            <>
              <Spacer />
              <Text textStyle={{ ...styles.descriptionStyle, fontSize: 11 }}>Checking...</Text>
            </>
          ) : null}
        </Row>
      ) : null}

      {descriptionText && labelPosition !== 'hidden' ? (
        <Text textStyle={styles.descriptionStyle}>{descriptionText}</Text>
      ) : null}

      {children}

      {error ? (
        <Text
          modifiers={errorModifiers}
          testID={`field-error-${fieldPath}`}
          textStyle={styles.errorStyle}
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text testID={`field-helper-${fieldPath}`} textStyle={styles.descriptionStyle}>
          {helperText}
        </Text>
      ) : null}
    </Column>
  );
}
