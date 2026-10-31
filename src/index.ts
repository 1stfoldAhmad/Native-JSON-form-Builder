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
  BUILT_IN_FIELD_TYPE_ALIASES,
} from './fields/FieldRegistry';

// Intelligent Form Engine: Dependency Graph, Formula Engine & Schema Compiler
export {
  DependencyGraph,
  expandTargetTemplatePaths,
  toWildcardTemplatePath,
  type DependencyEdge,
  type DependencyEdgeKind,
  type DependencyEvaluationPlan,
  type DependencyGraphSnapshot,
} from './engine';
export {
  FormulaSyntaxError,
  MAX_FORMULA_LENGTH,
  MAX_FORMULA_TOKENS,
  MAX_FORMULA_AST_DEPTH,
  tokenizeFormula,
  parseFormula,
  inspectFormulaAST,
  clearCompiledFormulaCache,
  FormulaFunctionRegistry,
  defaultFormulaFunctionRegistry,
  evaluateFormula,
  resolveFormulaFieldPath,
  type FormulaToken,
  type FormulaASTNode,
  type FormulaParseResult,
  type PureFormulaFunction,
  type FormulaScopeContext,
  type FormulaEvalResult,
} from './formula';
export {
  SCHEMA_COMPILER_VERSION,
  canonicalStableStringify,
  fnv1aHashHex,
  computeConfigFingerprints,
  compileFormSchema,
  clearCompiledFormPlanCache,
  type CompiledFieldNode,
  type CompiledFormPlan,
  type CompileFormOptions,
} from './compiler';

// Icons
export {
  FormIcon,
  NativeIconButton,
  registerFormIcon,
  resolveIconDefinition,
} from './icons/IconRenderer';

// Validation, conditions, computed fields, state, styles, animations, uploads
export { ValidationEngine, collectActiveFields } from './validation/ValidationEngine';
export {
  AsyncValidationManager,
  normalizeServerValidationErrors,
  type AsyncValidationManagerOptions,
} from './validation/AsyncValidationManager';
export {
  DataSourceManager,
  interpolateDataSourceUrl,
  mapRawItemToFieldOption,
  type AuthHeaderProvider,
  type DataSourceManagerOptions,
  type FetchLike,
  type LoadFieldOptionsRequest,
} from './datasources';
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
  ConditionRegistry,
  defaultConditionRegistry,
  type CustomConditionOperatorFn,
} from './conditions/ConditionRegistry';
export {
  buildDependencyGraph,
  evaluateCondition,
  extractConditionFieldPaths,
  isFieldVisible,
  isFieldEnabled,
  isFieldReadOnly,
  isFieldRequired,
  collectFieldDependencies,
  type ConditionEvaluationContext,
} from './conditions/evaluator';
export { evaluateComputedField } from './conditions/computed';
export { FormStore, buildInitialFormValues } from './state/FormStore';
export { PathSubscriptionIndex } from './state/PathSubscriptionIndex';
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
  buildServerUploadPolicyManifest,
  type ResolvedUploadConstraints,
  type ServerUploadFieldPolicy,
  type ServerUploadVerificationCheck,
} from './uploads/UploadAdapter';
export {
  getByPath,
  setByPath,
  deleteByPath,
  deepClone,
  deepEqual,
  hasUnsafePathSegment,
} from './utils/deepPath';
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
  parseNumericInput,
  normalizeLocalizedNumerals,
  resolvePluralizedText,
  formatFileSize,
  calculateAgeInYears,
  resolveLocalizedText,
  isRTLLocale,
} from './utils/formatting';
export { resolveResponsiveColumnCount } from './renderer/FormRenderer';
export {
  ThemeRegistry,
  defaultThemeRegistry,
  type RegisteredFormTheme,
} from './styles/ThemeRegistry';
export {
  createFieldPackage,
  type CustomFieldValidatorFn,
  type FieldPackageDefinition,
} from './fields/createFieldPackage';
export {
  MiddlewarePipeline,
  PluginRegistry,
  type FieldChangeMiddlewarePayload,
  type FormLifecycleHookName,
  type FormPlugin,
  type MiddlewareHandler,
  type MiddlewarePayloadMap,
  type MiddlewarePipelineOptions,
  type PluginRegistryOptions,
  type StepChangeMiddlewarePayload,
  type SubmitMiddlewarePayload,
} from './plugins';
export {
  diffFormSchemas,
  generateFormValuesTypeScript,
  validateMigrationChain,
  type SchemaDiffChange,
  type SchemaDiffKind,
  type SchemaDiffReport,
  type SubmissionMigrationStep,
  type TypeGeneratorOptions,
} from './tooling';
export {
  PerformanceProfiler,
  REDACTED_SENSITIVE_TOKEN,
  inspectFormRuntime,
  type FormDiagnosticSnapshot,
  type PerformanceProfileReport,
  type ProfilerMetricCategory,
  type ProfilerMetricSummary,
} from './devtools';
export {
  PlatformCapabilityRegistry,
  defaultCapabilityRegistry,
  type BarcodeScanResult,
  type BarcodeScannerAdapter,
  type DocumentScannerAdapter,
  type DrawnSignatureResult,
  type GeoCoordinatesResult,
  type LocationCaptureAdapter,
  type ScannedDocumentResult,
  type SignatureCaptureAdapter,
  type CapabilityCheckIssue,
  type SchemaCapabilityReport,
} from './capabilities';
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

// Enterprise Persistence, Offline Queue, Workflows, Versioning & Remote Schemas (Level 2)
export {
  DefaultConnectivityAdapter,
  DRAFT_ENVELOPE_VERSION,
  DraftManager,
  OfflineSubmissionQueue,
  RemoteDraftSyncController,
  type ConnectivityAdapter,
  type ConnectivityListener,
  type DraftEnvelope,
  type DraftManagerOptions,
  type DraftVersionConflictContext,
  type LoadedDraftResult,
  type OfflineSubmissionQueueOptions,
  type QueuedAttachmentEntry,
  type QueuedSubmissionRecord,
  type QueuedSubmissionStatus,
  type SubmissionTransportOutcome,
  type DraftConflictStrategy,
  type RemoteDraftSnapshot,
  type RemoteDraftTransport,
} from './persistence';
export {
  evaluatePermissionRule,
  extractServerPermissionManifest,
  SubmissionLifecycleMachine,
  canTransitionSubmissionState,
  ApprovalWorkflowEngine,
  StepWorkflowController,
  type ActorIdentity,
  type EvaluatedPermissionState,
  type ServerPermissionManifestEntry,
  type SubmissionLifecycleSnapshot,
  type SubmissionTransitionAuditEntry,
  type ApprovalAuditRecord,
  type ApprovalDecisionAction,
  type ApprovalStageRuntimeState,
  type StepRuntimeSummary,
  type WizardProgressSummary,
} from './workflows';
export {
  SchemaVersionRegistry,
  parseSemverTuple,
  compareSemver,
  isEngineVersionCompatible,
  type SchemaMigrationFn,
} from './versioning/SchemaVersionRegistry';
export {
  LIBRARY_ENGINE_VERSION,
  RemoteSchemaManager,
  type RemoteSchemaFetchResult,
  type RemoteSchemaFetcher,
  type ResolvedRemoteSchema,
} from './remote/RemoteSchemaManager';

// Complete TypeScript Configuration Contract & Types
export { defineFormConfig } from './types/config';
export type * from './types';
