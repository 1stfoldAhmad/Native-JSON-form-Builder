import { describe, expect, it } from 'vitest';

import * as PublicAPI from '../src';

describe('Phase 0 — Public API Surface & Backward Compatibility Baseline', () => {
  it('preserves every foundational v1.0.x public export symbol and 88 base field types', () => {
    const requiredLegacyExports = [
      'ExpoForm',
      'ExpoFormProvider',
      'HostBoundary',
      'ManagedRNHostView',
      'useActiveForm',
      'useExpoFormGlobalConfig',
      'useHasManagedHost',
      'parseAndValidateFormConfig',
      'parseFormJson',
      'validateFormStandard',
      'EXPO_FORM_SCHEMA_URI',
      'FormConfigBuilder',
      'createFormBuilder',
      'serializeFormConfig',
      'createStarterFormTemplate',
      'FieldRegistry',
      'defaultFieldRegistry',
      'createDefaultFieldRegistry',
      'registerField',
      'ALL_BUILT_IN_FIELD_TYPES',
      'FormIcon',
      'NativeIconButton',
      'registerFormIcon',
      'resolveIconDefinition',
      'ValidationEngine',
      'collectActiveFields',
      'evaluatePasswordStrength',
      'VALIDATION_PATTERNS',
      'isValidEmail',
      'isValidPhone',
      'isValidEmailOrPhone',
      'isValidCNIC',
      'isValidPostalCode',
      'evaluateCondition',
      'isFieldVisible',
      'isFieldEnabled',
      'isFieldRequired',
      'collectFieldDependencies',
      'evaluateComputedField',
      'FormStore',
      'buildInitialFormValues',
      'useFormSelector',
      'useNativeTextState',
      'resolveFormStyles',
      'resolveFieldStyles',
      'resolveAnimationTrigger',
      'buildNativeAnimationModifiers',
      'useReducedMotion',
      'resolveUploadConstraints',
      'validateSelectedFiles',
      'COUNTRIES',
      'STATES_BY_COUNTRY',
      'CITIES_BY_STATE',
      'COMMON_TIMEZONES',
      'BUILT_IN_DATA_SOURCES',
      'getCountryByCode',
      'getCountryOptions',
      'applyMask',
      'stripMask',
      'MASK_PRESETS',
      'formatNumberValue',
      'formatFileSize',
      'calculateAgeInYears',
      'resolveLocalizedText',
      'isRTLLocale',
      'BUILT_IN_SECRET_FIELD_TYPES',
      'isBuiltInSecretFieldType',
      'isSensitiveField',
      'collectSensitiveFieldPaths',
      'omitSensitiveValues',
      'redactSensitiveForLog',
      'analyzeRegexSafety',
      'compileSafeRegex',
      'safeRegexTest',
      'defineFormConfig',
    ] as const;

    for (const sym of requiredLegacyExports) {
      expect(
        sym in PublicAPI,
        `Expected legacy public symbol "${sym}" to remain exported`
      ).toBe(true);
    }

    expect(PublicAPI.ALL_BUILT_IN_FIELD_TYPES.length).toBe(88);
    expect(PublicAPI.defaultFieldRegistry.has('calculated')).toBe(true);
    expect(PublicAPI.defaultFieldRegistry.has('computed')).toBe(true);
  });
});
