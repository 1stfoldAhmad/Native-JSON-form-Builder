// Primary public components & hooks
export { ExpoForm } from './core/ExpoForm';
export {
  ExpoFormProvider,
  type ExpoFormProviderProps,
} from './core/ExpoFormProvider';
export {
  HostBoundary,
  ManagedRNHostView,
  type HostBoundaryProps,
} from './core/HostBoundary';
export {
  useActiveForm,
  useExpoFormGlobalConfig,
  useHasManagedHost,
} from './core/context';
export {
  parseAndValidateFormConfig,
  parseFormJson,
  validateFormStandard,
  type ParseFormConfigOptions,
  type ParsedFormConfigResult,
} from './core/configParser';
export {
  EXPO_FORM_SCHEMA_URI,
  FormConfigBuilder,
  createFormBuilder,
  serializeFormConfig,
  createStarterFormTemplate,
  type StarterTemplateKind,
} from './core/formBuilder';

// Field registry & custom field registration
export {
  FieldRegistry,
  defaultFieldRegistry,
  createDefaultFieldRegistry,
  registerField,
  ALL_BUILT_IN_FIELD_TYPES,
} from './fields/FieldRegistry';

// Icons
export {
  FormIcon,
  NativeIconButton,
  registerFormIcon,
  resolveIconDefinition,
} from './icons/IconRenderer';

// Validation, conditions, computed fields, state, styles, animations, uploads
export { ValidationEngine, collectActiveFields } from './validation/ValidationEngine';
export { evaluatePasswordStrength } from './validation/passwordStrength';
export {
  VALIDATION_PATTERNS,
  isValidEmail,
  isValidPhone,
  isValidEmailOrPhone,
  isValidCNIC,
  isValidPostalCode,
} from './validation/patterns';
export {
  evaluateCondition,
  isFieldVisible,
  isFieldEnabled,
  isFieldRequired,
  collectFieldDependencies,
} from './conditions/evaluator';
export { evaluateComputedField } from './conditions/computed';
export { FormStore, buildInitialFormValues } from './state/FormStore';
export { useFormSelector } from './state/useFormSelector';
export { useNativeTextState } from './state/useNativeTextState';
export { resolveFormStyles, resolveFieldStyles } from './styles/StyleResolver';
export {
  resolveAnimationTrigger,
  buildNativeAnimationModifiers,
  useReducedMotion,
} from './animations/AnimationAdapter';
export {
  resolveUploadConstraints,
  validateSelectedFiles,
} from './uploads/UploadAdapter';
export {
  COUNTRIES,
  STATES_BY_COUNTRY,
  CITIES_BY_STATE,
  COMMON_TIMEZONES,
  BUILT_IN_DATA_SOURCES,
  getCountryByCode,
  getCountryOptions,
} from './utils/countries';
export { applyMask, stripMask, MASK_PRESETS } from './utils/masking';
export {
  formatNumberValue,
  formatFileSize,
  calculateAgeInYears,
  resolveLocalizedText,
  isRTLLocale,
} from './utils/formatting';
export {
  BUILT_IN_SECRET_FIELD_TYPES,
  isBuiltInSecretFieldType,
  isSensitiveField,
  collectSensitiveFieldPaths,
  omitSensitiveValues,
  redactSensitiveForLog,
} from './utils/security';
export {
  MAX_REGEX_PATTERN_LENGTH,
  MAX_REGEX_INPUT_LENGTH,
  MAX_REGEX_QUANTIFIER_BOUND,
  analyzeRegexSafety,
  compileSafeRegex,
  safeRegexTest,
  type RegexSafetyAnalysis,
  type SafeRegexTestResult,
} from './utils/regexSafety';

// Complete TypeScript Configuration Contract & Types
export { defineFormConfig } from './types/config';
export type * from './types';
