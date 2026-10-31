import { AccessibilityInfo, Keyboard } from 'react-native';

import {
  compileFormSchema,
  type CompiledFieldNode,
  type CompiledFormPlan,
} from '../compiler';
import { evaluateComputedField } from '../conditions/computed';
import type { ConditionRegistry } from '../conditions/ConditionRegistry';
import {
  collectFieldDependencies,
  evaluateCondition,
  isFieldEnabled,
  isFieldReadOnly,
  isFieldRequired,
  isFieldVisible,
  type ConditionEvaluationContext,
} from '../conditions/evaluator';
import {
  expandTargetTemplatePaths,
  toWildcardTemplatePath,
  type DependencyGraph,
} from '../engine/DependencyGraph';
import { evaluateFormula, type FormulaFunctionRegistry } from '../formula';
import type {
  ActionHandler,
  AsyncFieldValidator,
  ComputedCalculator,
  DraftStorageAdapter,
  FieldConfig,
  FieldRuntimeState,
  FocusableFieldHandle,
  FormConfig,
  FormFileAsset,
  FormStateSnapshot,
  FormSubmitHelpers,
  FormSubmitStatus,
  FormValues,
  SchemaReconciliationReport,
  ValidationResult,
} from '../types';
import { createDebounced, type DebouncedFunction } from '../utils/debounce';
import {
  deepClone,
  deepEqual,
  deleteByPath,
  getByPath,
  setByPath,
} from '../utils/deepPath';
import { collectSensitiveFieldPaths, omitSensitiveValues } from '../utils/security';
import { normalizeServerValidationErrors } from '../validation/AsyncValidationManager';
import {
  resolveUploadConstraints,
  validateSelectedFiles,
} from '../uploads/UploadAdapter';
import { collectActiveFields, ValidationEngine } from '../validation/ValidationEngine';
import { PathSubscriptionIndex } from './PathSubscriptionIndex';

export interface FormStoreCallbacks {
  onChange?: (values: FormValues, meta: { changedField: string; isDirty: boolean }) => void;
  onFieldChange?: (fieldName: string, value: unknown, values: FormValues) => void;
  onSubmit?: (values: FormValues, helpers: FormSubmitHelpers) => void | Promise<void>;
  onInvalid?: (
    errors: Record<string, string>,
    result: ValidationResult,
    values: FormValues
  ) => void;
  onFocus?: (fieldName: string) => void;
  onBlur?: (fieldName: string, value: unknown) => void;
  onValidation?: (result: ValidationResult) => void;
  onFilesSelected?: (fieldName: string, files: FormFileAsset[]) => void;
  onReset?: (values: FormValues) => void;
  onStepChange?: (stepIndex: number, stepId: string) => void;
}

export interface ScrollToFieldOptions {
  /** True when `FormStore` will immediately invoke the field's own native `.focus()` handle. */
  willFocusField?: boolean;
}

export interface FormStoreInitOptions {
  config: FormConfig;
  initialValues?: FormValues;
  resetKey?: string | number;
  enableReinitialize?: boolean;
  keepDirtyOnReinitialize?: boolean;
  renamedFields?: Record<string, string>;
  loading?: boolean;
  callbacks?: FormStoreCallbacks;
  asyncValidators?: Record<string, AsyncFieldValidator>;
  actions?: Record<string, ActionHandler>;
  calculators?: Record<string, ComputedCalculator>;
  functionRegistry?: FormulaFunctionRegistry;
  conditionRegistry?: ConditionRegistry;
  storageAdapter?: DraftStorageAdapter;
  locale?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onScrollToField?: (fieldName: string, options?: ScrollToFieldOptions) => void;
}

const BOOLEAN_FIELD_TYPES = new Set(['checkbox', 'switch']);
const NUMERIC_FIELD_TYPES = new Set([
  'number',
  'integer',
  'decimal',
  'currency',
  'percentage',
  'age',
  'quantity',
  'price',
  'phoneExtension',
  'slider',
  'rating',
  'year',
  'duration',
]);
const INTEGER_FIELD_TYPES = new Set([
  'integer',
  'age',
  'quantity',
  'phoneExtension',
  'year',
]);
const MULTI_CHOICE_FIELD_TYPES = new Set([
  'checkboxGroup',
  'multiSelect',
  'searchableMultiSelect',
  'chips',
  'tagInput',
]);
const SINGLE_CHOICE_FIELD_TYPES = new Set([
  'select',
  'searchableSelect',
  'radioGroup',
  'segmentedControl',
]);
const UPLOAD_FIELD_TYPES = new Set([
  'image',
  'camera',
  'avatar',
  'video',
  'audio',
  'document',
  'documentScan',
  'pdf',
  'file',
  'multipleFiles',
  'multipleImages',
  'signature',
]);
const STRUCTURAL_WRAPPER_TYPES = new Set([
  'section',
  'fieldGroup',
  'conditionalGroup',
]);
const NON_VALUE_DISPLAY_TYPES = new Set([
  'heading',
  'description',
  'staticText',
  'divider',
]);

function extractAllowedStaticOptions(field: FieldConfig): Set<unknown> | null {
  if (field.dataSource || !field.options || field.options.length === 0) {
    return null;
  }
  const allowed = new Set<unknown>();
  for (const opt of field.options) {
    if (opt !== null && typeof opt === 'object' && 'value' in opt) {
      allowed.add(opt.value);
    } else {
      allowed.add(opt);
    }
  }
  return allowed;
}

function coerceReconciledFieldValue(
  currentVal: unknown,
  prevField: FieldConfig | undefined,
  nextField: FieldConfig,
  seededDefault: unknown
): { value: unknown; replaced: boolean } {
  const nextType = nextField.type;
  const prevType = prevField?.type;

  if (nextType === 'calculated' || nextType === 'computed' || nextField.formula || nextField.computed) {
    return { value: currentVal, replaced: prevType !== nextType };
  }

  // Upload <-> non-upload transitions are never value-compatible
  const prevWasUpload = Boolean(prevType && UPLOAD_FIELD_TYPES.has(prevType));
  const nextIsUpload = UPLOAD_FIELD_TYPES.has(nextType);
  if (prevWasUpload !== nextIsUpload) {
    return { value: deepClone(seededDefault), replaced: true };
  }
  if (nextIsUpload) {
    const nextMulti =
      nextType === 'multipleFiles' ||
      nextType === 'multipleImages' ||
      Boolean(nextField.upload?.multiple);
    if (nextMulti && !Array.isArray(currentVal)) {
      return { value: currentVal ? [currentVal] : [], replaced: true };
    }
    if (!nextMulti && Array.isArray(currentVal)) {
      return { value: currentVal[0] ?? undefined, replaced: true };
    }
    return { value: currentVal, replaced: false };
  }

  if (BOOLEAN_FIELD_TYPES.has(nextType)) {
    if (typeof currentVal === 'boolean') return { value: currentVal, replaced: false };
    return { value: deepClone(seededDefault ?? false), replaced: true };
  }

  if (NUMERIC_FIELD_TYPES.has(nextType)) {
    if (typeof currentVal === 'number' && Number.isFinite(currentVal)) {
      const normalized = INTEGER_FIELD_TYPES.has(nextType)
        ? Math.trunc(currentVal)
        : currentVal;
      return { value: normalized, replaced: normalized !== currentVal };
    }
    if (typeof currentVal === 'string' && currentVal.trim() !== '') {
      const parsed = Number(currentVal.trim());
      if (Number.isFinite(parsed)) {
        return {
          value: INTEGER_FIELD_TYPES.has(nextType) ? Math.trunc(parsed) : parsed,
          replaced: true,
        };
      }
    }
    return { value: deepClone(seededDefault), replaced: true };
  }

  if (nextType === 'rangeSlider') {
    if (
      Array.isArray(currentVal) &&
      currentVal.length === 2 &&
      typeof currentVal[0] === 'number' &&
      typeof currentVal[1] === 'number'
    ) {
      return { value: currentVal, replaced: false };
    }
    return { value: deepClone(seededDefault ?? [nextField.min ?? 0, nextField.max ?? 100]), replaced: true };
  }

  if (MULTI_CHOICE_FIELD_TYPES.has(nextType)) {
    const allowed = extractAllowedStaticOptions(nextField);
    if (Array.isArray(currentVal)) {
      if (!allowed) return { value: currentVal, replaced: false };
      const filtered = currentVal.filter((item) => allowed.has(item));
      return {
        value: filtered,
        replaced: filtered.length !== currentVal.length,
      };
    }
    if (
      (typeof currentVal === 'string' || typeof currentVal === 'number') &&
      currentVal !== ''
    ) {
      if (!allowed || allowed.has(currentVal)) {
        return { value: [currentVal], replaced: true };
      }
    }
    return { value: deepClone(seededDefault ?? []), replaced: true };
  }

  if (SINGLE_CHOICE_FIELD_TYPES.has(nextType)) {
    if (
      currentVal === undefined ||
      currentVal === null ||
      typeof currentVal === 'object'
    ) {
      return { value: deepClone(seededDefault), replaced: currentVal !== undefined };
    }
    const allowed = extractAllowedStaticOptions(nextField);
    if (allowed && currentVal !== '' && !allowed.has(currentVal)) {
      return { value: deepClone(seededDefault), replaced: true };
    }
    return { value: currentVal, replaced: false };
  }

  if (nextType === 'objectGroup') {
    if (currentVal && typeof currentVal === 'object' && !Array.isArray(currentVal)) {
      return { value: currentVal, replaced: false };
    }
    return { value: deepClone(seededDefault ?? {}), replaced: true };
  }

  if (nextType === 'repeater' || nextType === 'arrayGroup') {
    if (Array.isArray(currentVal)) {
      if (typeof nextField.maxItems === 'number' && currentVal.length > nextField.maxItems) {
        return { value: currentVal.slice(0, nextField.maxItems), replaced: true };
      }
      return { value: currentVal, replaced: false };
    }
    return { value: deepClone(seededDefault ?? []), replaced: true };
  }

  if (nextType === 'coordinates') {
    if (currentVal && typeof currentVal === 'object' && !Array.isArray(currentVal)) {
      return { value: currentVal, replaced: false };
    }
    return { value: deepClone(seededDefault ?? { latitude: '', longitude: '' }), replaced: true };
  }

  if (nextType === 'dateRange') {
    if (currentVal && typeof currentVal === 'object' && !Array.isArray(currentVal)) {
      return { value: currentVal, replaced: false };
    }
    return { value: deepClone(seededDefault ?? { startDate: '', endDate: '' }), replaced: true };
  }

  // Default scalar string/text-like field
  if (typeof currentVal === 'string' || currentVal === undefined) {
    return { value: currentVal, replaced: false };
  }
  if (typeof currentVal === 'number') {
    return { value: String(currentVal), replaced: true };
  }
  return { value: deepClone(seededDefault ?? ''), replaced: true };
}

function pruneValuesAgainstFields(
  source: FormValues,
  fields: readonly FieldConfig[]
): FormValues {
  const out: FormValues = {};

  const collectInto = (
    targetObj: Record<string, unknown>,
    srcObj: Record<string, unknown>,
    fieldList: readonly FieldConfig[]
  ) => {
    for (const field of fieldList) {
      if (field.type === 'stepGroup' && field.steps) {
        for (const step of field.steps) {
          collectInto(targetObj, srcObj, step.fields);
        }
        continue;
      }
      if (STRUCTURAL_WRAPPER_TYPES.has(field.type) && field.fields) {
        collectInto(targetObj, srcObj, field.fields);
        continue;
      }
      if (NON_VALUE_DISPLAY_TYPES.has(field.type) || !field.name) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(srcObj, field.name)) {
        continue;
      }
      const rawVal = srcObj[field.name];

      if (
        field.type === 'objectGroup' &&
        field.fields &&
        rawVal &&
        typeof rawVal === 'object' &&
        !Array.isArray(rawVal)
      ) {
        const nestedTarget: Record<string, unknown> = {};
        collectInto(nestedTarget, rawVal as Record<string, unknown>, field.fields);
        targetObj[field.name] = nestedTarget;
      } else if (
        (field.type === 'repeater' || field.type === 'arrayGroup') &&
        field.fields &&
        field.fields.length > 0 &&
        Array.isArray(rawVal)
      ) {
        const boundedRows =
          typeof field.maxItems === 'number' && rawVal.length > field.maxItems
            ? rawVal.slice(0, field.maxItems)
            : rawVal;
        targetObj[field.name] = boundedRows.map((row) => {
          if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return deepClone(row);
          }
          const prunedRow: Record<string, unknown> = {};
          collectInto(prunedRow, row as Record<string, unknown>, field.fields!);
          return prunedRow;
        });
      } else {
        targetObj[field.name] = deepClone(rawVal);
      }
    }
  };

  collectInto(out, source, fields);
  return out;
}

function collectTopValueFieldsForPruning(config: FormConfig): FieldConfig[] {
  const byName = new Map<string, FieldConfig>();
  for (const f of config.fields ?? []) {
    if (f.name) byName.set(f.name, f);
  }
  const combined: FieldConfig[] = [];
  if (config.fields) combined.push(...config.fields);
  for (const sec of config.sections ?? []) {
    for (const item of sec.fields) {
      if (typeof item === 'string') {
        const ref = byName.get(item);
        if (ref && !combined.includes(ref)) combined.push(ref);
      } else {
        combined.push(item);
      }
    }
  }
  for (const step of config.steps ?? []) {
    combined.push(...step.fields);
  }
  return combined;
}

function defaultEmptyForField(field: FieldConfig): unknown {
  if (field.defaultValue !== undefined) return deepClone(field.defaultValue);
  switch (field.type) {
    case 'checkbox':
    case 'switch':
      return false;
    case 'checkboxGroup':
    case 'multiSelect':
    case 'searchableMultiSelect':
    case 'chips':
    case 'tagInput':
    case 'multipleFiles':
    case 'multipleImages':
    case 'repeater':
    case 'arrayGroup':
      return [];
    case 'rangeSlider':
      return [field.min ?? 0, field.max ?? 100];
    case 'slider':
      return field.min ?? 0;
    case 'rating':
      return 0;
    case 'objectGroup':
      return {};
    case 'dateRange':
      return { startDate: '', endDate: '' };
    case 'coordinates':
      return { latitude: '', longitude: '' };
    default:
      return undefined;
  }
}

export function buildInitialFormValues(
  config: FormConfig,
  propInitialValues?: FormValues
): FormValues {
  let values: FormValues = {};

  const seedFields = (fields: readonly FieldConfig[] | undefined, prefix = '') => {
    if (!fields) return;
    for (const field of fields) {
      const path = field.name ? (prefix ? `${prefix}.${field.name}` : field.name) : prefix;
      if (field.type === 'stepGroup' && field.steps) {
        for (const s of field.steps) seedFields(s.fields, prefix);
        continue;
      }
      if (
        (field.type === 'section' ||
          field.type === 'fieldGroup' ||
          field.type === 'conditionalGroup') &&
        field.fields
      ) {
        seedFields(field.fields, prefix);
        continue;
      }
      if (field.type === 'objectGroup' && field.name && field.fields) {
        seedFields(field.fields, path);
        continue;
      }
      if (field.name) {
        const def = defaultEmptyForField(field);
        if (def !== undefined) {
          values = setByPath(values, path, def);
        }
      }
    }
  };

  seedFields(config.fields);
  if (config.sections) {
    for (const sec of config.sections) {
      const inlineFields = sec.fields.filter((f): f is FieldConfig => typeof f !== 'string');
      seedFields(inlineFields);
    }
  }
  if (config.steps) {
    for (const step of config.steps) {
      seedFields(step.fields);
    }
  }

  if (config.defaults) {
    for (const [k, v] of Object.entries(config.defaults)) {
      values = setByPath(values, k, deepClone(v));
    }
  }

  if (propInitialValues) {
    for (const [k, v] of Object.entries(propInitialValues)) {
      if (v !== undefined) {
        values = setByPath(values, k, deepClone(v));
      }
    }
  }

  return values;
}

export class FormStore {
  private config: FormConfig;
  private validationEngine: ValidationEngine;
  private callbacks: FormStoreCallbacks;
  private asyncValidators?: Record<string, AsyncFieldValidator>;
  private actions?: Record<string, ActionHandler>;
  private calculators?: Record<string, ComputedCalculator>;
  private functionRegistry?: FormulaFunctionRegistry;
  private conditionRegistry?: ConditionRegistry;
  private storageAdapter?: DraftStorageAdapter;
  private onScrollToField?: (fieldName: string, options?: ScrollToFieldOptions) => void;
  private locale: string;
  private formDisabled: boolean;
  private formReadOnly: boolean;
  private externalLoading: boolean;
  private lastResetKey: string | number | undefined;
  private enableReinitialize: boolean;
  private keepDirtyOnReinitialize: boolean;
  private lastExternalInitialValues: FormValues | undefined;

  private values: FormValues;
  private initialValues: FormValues;
  private errors: Record<string, string> = {};
  private formErrors: string[] = [];
  private dirtyFields: Record<string, boolean> = {};
  private touchedFields: Record<string, boolean> = {};
  private validatingFields: Record<string, boolean> = {};
  private filesByField: Record<string, FormFileAsset[]> = {};
  private focusedField: string | null = null;
  private submitCount = 0;
  private submitStatus: FormSubmitStatus = 'idle';
  private isSubmitting = false;
  private isAdvancingStep = false;
  private submitEpoch = 0;
  private currentStepIndex = 0;

  /** Incremented ONLY on programmatic updates (`setValue`, `reset`, draft restore, computed) so native TextInputs never flicker during typing. */
  private externalValueVersion: Record<string, number> = {};
  /** Incremented on EVERY value mutation (user typing, programmatic, reset, computed) to invalidate stale in-flight async validations. */
  private fieldValueVersion: Record<string, number> = {};
  /** Monotonic per-field async validation sequence token. */
  private fieldValidationSeq: Record<string, number> = {};
  /** Monotonic form-wide epoch bumped on `reset()` or `config.id` change to discard stale async validations. */
  private formValidationEpoch = 0;

  private sensitivePaths: Set<string>;
  private builtInSecretPaths: Set<string>;
  private compiledPlan: CompiledFormPlan;
  private allFieldsMap = new Map<string, FieldConfig>();
  private reverseDependencyMap = new Map<string, Set<string>>();
  private resetOnDepMap = new Map<string, Set<string>>();
  private computedFields: { path: string; field: FieldConfig }[] = [];

  private pathSubscriptionIndex = new PathSubscriptionIndex();
  private globalListeners = new Set<() => void>();
  private lastNotifyBucketsInspected = 0;
  private batchDepth = 0;
  private pendingBatchPaths = new Set<string>();
  private pendingBatchNotifyAll = false;
  private focusHandles = new Map<string, FocusableFieldHandle>();
  private fieldValidateDebouncers = new Map<string, DebouncedFunction<[string]>>();
  private draftSaveDebouncer: DebouncedFunction<[]> | null = null;
  private snapshotVersion = 0;

  constructor(options: FormStoreInitOptions) {
    this.config = options.config;
    this.callbacks = options.callbacks ?? {};
    this.asyncValidators = options.asyncValidators;
    this.actions = options.actions;
    this.calculators = options.calculators;
    this.functionRegistry = options.functionRegistry;
    this.conditionRegistry = options.conditionRegistry;
    this.storageAdapter = options.storageAdapter;
    this.onScrollToField = options.onScrollToField;
    this.locale = options.locale ?? options.config.i18n?.locale ?? 'en';
    this.formDisabled = Boolean(options.disabled ?? options.config.disabled);
    this.formReadOnly = Boolean(options.readOnly ?? options.config.readOnly);
    this.externalLoading = Boolean(options.loading);
    this.lastResetKey = options.resetKey;
    this.enableReinitialize = Boolean(options.enableReinitialize);
    this.keepDirtyOnReinitialize = Boolean(options.keepDirtyOnReinitialize);
    this.lastExternalInitialValues = options.initialValues
      ? deepClone(options.initialValues)
      : undefined;

    this.compiledPlan = compileFormSchema(this.config, {
      formulaRegistry: this.functionRegistry,
      conditionRegistry: this.conditionRegistry,
      bypassCache: Boolean(this.functionRegistry || this.conditionRegistry),
    });
    this.validationEngine = new ValidationEngine(this.config);
    this.sensitivePaths = collectSensitiveFieldPaths(this.config, this.config.security);
    this.builtInSecretPaths = collectSensitiveFieldPaths(
      this.config,
      this.config.security,
      '',
      { builtInSecretsOnly: true }
    );

    const seeded = buildInitialFormValues(this.config, options.initialValues);
    this.values = seeded;
    this.initialValues = deepClone(seeded);

    this.indexFieldsAndDependencies();
    this.applyDefaultFormulas(options.initialValues);
    this.recomputeAllComputedFields(false);
    this.initialValues = deepClone(this.values);
    this.setupDraftPersistence();
  }

  public syncProps(options: Partial<FormStoreInitOptions>): void {
    let shouldNotifyGlobal = false;

    if (options.callbacks) this.callbacks = options.callbacks;
    if (options.asyncValidators !== undefined) this.asyncValidators = options.asyncValidators;
    if (options.actions !== undefined) this.actions = options.actions;
    if (options.calculators !== undefined) this.calculators = options.calculators;
    if (options.functionRegistry !== undefined) this.functionRegistry = options.functionRegistry;
    if (options.conditionRegistry !== undefined) this.conditionRegistry = options.conditionRegistry;
    if (options.storageAdapter !== undefined) this.storageAdapter = options.storageAdapter;
    if (options.onScrollToField !== undefined) this.onScrollToField = options.onScrollToField;

    if (options.locale && options.locale !== this.locale) {
      this.locale = options.locale;
      shouldNotifyGlobal = true;
    }
    if (options.disabled !== undefined) {
      const nextDisabled = Boolean(options.disabled || this.config.disabled);
      if (nextDisabled !== this.formDisabled) {
        this.formDisabled = nextDisabled;
        shouldNotifyGlobal = true;
      }
    }
    if (options.readOnly !== undefined) {
      const nextReadOnly = Boolean(options.readOnly || this.config.readOnly);
      if (nextReadOnly !== this.formReadOnly) {
        this.formReadOnly = nextReadOnly;
        shouldNotifyGlobal = true;
      }
    }
    if (options.loading !== undefined) {
      const nextLoading = Boolean(options.loading);
      if (nextLoading !== this.externalLoading) {
        this.externalLoading = nextLoading;
        shouldNotifyGlobal = true;
      }
    }
    if (options.enableReinitialize !== undefined) {
      this.enableReinitialize = Boolean(options.enableReinitialize);
    }
    if (options.keepDirtyOnReinitialize !== undefined) {
      this.keepDirtyOnReinitialize = Boolean(options.keepDirtyOnReinitialize);
    }

    let initializedByConfigOrKey = false;

    if (options.config && options.config !== this.config) {
      const prevId = this.config.id;
      const prevFingerprint = this.compiledPlan.fingerprint;

      if (options.config.id !== prevId) {
        this.config = options.config;
        this.compiledPlan = compileFormSchema(this.config, {
          formulaRegistry: this.functionRegistry,
          conditionRegistry: this.conditionRegistry,
          bypassCache: Boolean(this.functionRegistry || this.conditionRegistry),
        });
        this.validationEngine.updateConfig(options.config);
        this.sensitivePaths = collectSensitiveFieldPaths(this.config, this.config.security);
        this.builtInSecretPaths = collectSensitiveFieldPaths(
          this.config,
          this.config.security,
          '',
          { builtInSecretsOnly: true }
        );
        this.indexFieldsAndDependencies();

        this.lastResetKey = options.resetKey;
        this.lastExternalInitialValues = options.initialValues
          ? deepClone(options.initialValues)
          : undefined;

        this.reinitializeFromExternalValues(options.initialValues, {
          keepDirtyValues: false,
          emitOnReset: false,
        });
        initializedByConfigOrKey = true;
        shouldNotifyGlobal = true;
      } else {
        const candidatePlan = compileFormSchema(options.config, {
          formulaRegistry: this.functionRegistry,
          conditionRegistry: this.conditionRegistry,
          bypassCache: Boolean(this.functionRegistry || this.conditionRegistry),
        });
        if (candidatePlan.fingerprint !== prevFingerprint) {
          this.reconcileSchema(
            options.config,
            { renamedFields: options.renamedFields },
            candidatePlan,
            false
          );
          shouldNotifyGlobal = true;
        } else {
          this.config = options.config;
        }
      }
    }

    // Explicit external resetKey policy
    if (
      !initializedByConfigOrKey &&
      'resetKey' in options &&
      !Object.is(options.resetKey, this.lastResetKey)
    ) {
      this.lastResetKey = options.resetKey;
      this.lastExternalInitialValues = options.initialValues
        ? deepClone(options.initialValues)
        : undefined;
      this.reinitializeFromExternalValues(options.initialValues, {
        keepDirtyValues: false,
        emitOnReset: true,
      });
      initializedByConfigOrKey = true;
      shouldNotifyGlobal = true;
    }

    // Opt-in deep-compared `enableReinitialize` policy (ignores identical object re-renders)
    if (
      !initializedByConfigOrKey &&
      this.enableReinitialize &&
      'initialValues' in options &&
      !deepEqual(options.initialValues, this.lastExternalInitialValues)
    ) {
      this.lastExternalInitialValues = options.initialValues
        ? deepClone(options.initialValues)
        : undefined;
      this.reinitializeFromExternalValues(options.initialValues, {
        keepDirtyValues: this.keepDirtyOnReinitialize,
        emitOnReset: false,
      });
      shouldNotifyGlobal = true;
    }

    if (shouldNotifyGlobal) {
      this.bumpAndNotifyAll();
    }
  }

  private reinitializeFromExternalValues(
    nextExternalInitial: FormValues | undefined,
    opts: { keepDirtyValues: boolean; emitOnReset: boolean }
  ): void {
    this.fieldValidateDebouncers.forEach((d) => d.cancel());
    this.validationEngine.abortAsyncValidation();
    this.formValidationEpoch += 1;
    this.submitEpoch += 1;
    this.isSubmitting = false;
    this.isAdvancingStep = false;

    const preservedDirtySnapshots: Array<[string, unknown]> = [];
    if (opts.keepDirtyValues) {
      for (const [path, isDirty] of Object.entries(this.dirtyFields)) {
        if (isDirty) {
          preservedDirtySnapshots.push([path, deepClone(getByPath(this.values, path))]);
        }
      }
    }

    const seeded = buildInitialFormValues(this.config, nextExternalInitial);
    this.values = seeded;
    this.applyDefaultFormulas(nextExternalInitial);
    this.recomputeAllComputedFields(false);
    this.initialValues = deepClone(this.values);

    const nextDirtyFields: Record<string, boolean> = {};
    const nextTouchedFields: Record<string, boolean> = {};
    const nextErrors: Record<string, string> = {};

    if (opts.keepDirtyValues && preservedDirtySnapshots.length > 0) {
      for (const [path, dirtyVal] of preservedDirtySnapshots) {
        if (!this.isPathDefinedInCurrentSchema(path)) continue;
        this.values = setByPath(this.values, path, dirtyVal);
        const newInit = getByPath(this.initialValues, path);
        if (!deepEqual(dirtyVal, newInit)) {
          nextDirtyFields[path] = true;
          if (this.touchedFields[path]) nextTouchedFields[path] = true;
          if (this.errors[path]) nextErrors[path] = this.errors[path];
        }
      }
      this.recomputeAllComputedFields(false);
    } else {
      this.filesByField = {};
      this.currentStepIndex = 0;
    }

    this.errors = nextErrors;
    this.formErrors = [];
    this.dirtyFields = nextDirtyFields;
    this.touchedFields = nextTouchedFields;
    this.validatingFields = {};
    this.fieldValidationSeq = {};
    this.submitStatus = 'idle';

    for (const p of this.allFieldsMap.keys()) {
      this.externalValueVersion[p] = (this.externalValueVersion[p] ?? 0) + 1;
      this.fieldValueVersion[p] = (this.fieldValueVersion[p] ?? 0) + 1;
    }
    for (const k of Object.keys(this.values)) {
      this.externalValueVersion[k] = (this.externalValueVersion[k] ?? 0) + 1;
      this.fieldValueVersion[k] = (this.fieldValueVersion[k] ?? 0) + 1;
    }

    if (opts.emitOnReset) {
      this.callbacks.onReset?.(this.getValues());
    }
  }

  private isPathDefinedInCurrentSchema(concretePath: string): boolean {
    if (this.allFieldsMap.has(concretePath)) return true;
    const wildcard = toWildcardTemplatePath(concretePath);
    if (this.compiledPlan.nodes.has(wildcard)) return true;
    // Allow concrete repeater item prefixes (`items.0`) when `items` is a repeater/arrayGroup
    const rootSeg = concretePath.split('.')[0];
    const rootField = this.allFieldsMap.get(rootSeg);
    if (
      rootField &&
      (rootField.type === 'repeater' || rootField.type === 'arrayGroup') &&
      /^\d+$/.test(concretePath.split('.')[1] ?? '')
    ) {
      const rest = concretePath.split('.').slice(2).join('.');
      if (!rest) return true;
      return this.compiledPlan.nodes.has(`${rootSeg}.*.${rest}`);
    }
    return false;
  }

  /**
   * Reconciles runtime state (`values`, `initialValues`, `errors`, `dirtyFields`,
   * `touchedFields`, `filesByField`, `currentStepIndex`) against a replacement
   * `FormConfig` sharing the same form ID. Handles renamed, removed, modified, and
   * newly added fields cleanly.
   */
  public reconcileSchema(
    nextConfig: FormConfig,
    options?: { renamedFields?: Record<string, string> },
    precompiledPlan?: CompiledFormPlan,
    notify = true
  ): SchemaReconciliationReport {
    const prevConfig = this.config;
    const prevFieldsMap = new Map(this.allFieldsMap);
    const prevNodesMap = new Map(this.compiledPlan.nodes);

    this.validationEngine.abortAsyncValidation();
    this.formValidationEpoch += 1;

    this.config = nextConfig;
    this.compiledPlan =
      precompiledPlan ??
      compileFormSchema(this.config, {
        formulaRegistry: this.functionRegistry,
        conditionRegistry: this.conditionRegistry,
        bypassCache: Boolean(this.functionRegistry || this.conditionRegistry),
      });
    this.validationEngine.updateConfig(this.config);
    this.sensitivePaths = collectSensitiveFieldPaths(this.config, this.config.security);
    this.builtInSecretPaths = collectSensitiveFieldPaths(
      this.config,
      this.config.security,
      '',
      { builtInSecretsOnly: true }
    );
    this.indexFieldsAndDependencies();

    const report: SchemaReconciliationReport = {
      addedFields: [],
      removedFields: [],
      renamedFields: [],
      modifiedFields: [],
      preservedFields: [],
    };

    const renameOldToNew = new Map<string, string>();
    const renameNewToOld = new Map<string, string>();
    for (const [oldPath, newPath] of Object.entries(options?.renamedFields ?? {})) {
      if (oldPath && newPath && oldPath !== newPath && this.isPathDefinedInCurrentSchema(newPath)) {
        renameOldToNew.set(oldPath, newPath);
        renameNewToOld.set(newPath, oldPath);
      }
    }

    // 1. Apply explicit field renames (`oldPath -> newPath`) before pruning obsolete paths
    for (const [oldPath, newPath] of renameOldToNew.entries()) {
      const oldVal = getByPath(this.values, oldPath);
      const oldInit = getByPath(this.initialValues, oldPath);
      if (oldVal !== undefined && getByPath(this.values, newPath) === undefined) {
        this.values = setByPath(this.values, newPath, deepClone(oldVal));
      }
      this.values = deleteByPath(this.values, oldPath);

      if (oldInit !== undefined && getByPath(this.initialValues, newPath) === undefined) {
        this.initialValues = setByPath(this.initialValues, newPath, deepClone(oldInit));
      }
      this.initialValues = deleteByPath(this.initialValues, oldPath);

      if (this.dirtyFields[oldPath] !== undefined) {
        this.dirtyFields[newPath] = this.dirtyFields[oldPath];
        delete this.dirtyFields[oldPath];
      }
      if (this.touchedFields[oldPath] !== undefined) {
        this.touchedFields[newPath] = this.touchedFields[oldPath];
        delete this.touchedFields[oldPath];
      }
      if (this.errors[oldPath] !== undefined) {
        this.errors[newPath] = this.errors[oldPath];
        delete this.errors[oldPath];
      }
      if (this.filesByField[oldPath] !== undefined) {
        this.filesByField[newPath] = this.filesByField[oldPath];
        delete this.filesByField[oldPath];
      }
      this.externalValueVersion[newPath] = (this.externalValueVersion[newPath] ?? 0) + 1;
      this.markFieldMutated(newPath);
      report.renamedFields.push({ from: oldPath, to: newPath });
    }

    // 2. Record removed fields & prune obsolete paths from `values` and `initialValues`
    for (const oldPath of prevNodesMap.keys()) {
      if (renameOldToNew.has(oldPath)) continue;
      if (!this.compiledPlan.nodes.has(oldPath)) {
        report.removedFields.push(oldPath);
      }
    }

    const topValueFields = collectTopValueFieldsForPruning(this.config);
    this.values = pruneValuesAgainstFields(this.values, topValueFields);
    this.initialValues = pruneValuesAgainstFields(this.initialValues, topValueFields);

    // Prune metadata maps for any removed/obsolete concrete paths
    const pruneRecordKeys = (rec: Record<string, unknown>) => {
      for (const key of Object.keys(rec)) {
        if (!this.isPathDefinedInCurrentSchema(key)) {
          delete rec[key];
        }
      }
    };
    pruneRecordKeys(this.errors);
    pruneRecordKeys(this.dirtyFields);
    pruneRecordKeys(this.touchedFields);
    pruneRecordKeys(this.validatingFields);
    pruneRecordKeys(this.filesByField);
    pruneRecordKeys(this.fieldValueVersion);
    pruneRecordKeys(this.fieldValidationSeq);
    pruneRecordKeys(this.externalValueVersion);

    for (const [debouncedPath, debouncer] of this.fieldValidateDebouncers.entries()) {
      if (!this.isPathDefinedInCurrentSchema(debouncedPath)) {
        debouncer.cancel();
        this.fieldValidateDebouncers.delete(debouncedPath);
      }
    }

    if (this.focusedField && !this.isPathDefinedInCurrentSchema(this.focusedField)) {
      this.focusedField = null;
    }

    // 3. Reconcile added & modified fields
    const seeded = buildInitialFormValues(this.config);
    for (const [path, nextNode] of this.compiledPlan.nodes.entries()) {
      const nextField = nextNode.field;
      const sourceOldPath = renameNewToOld.get(path) ?? path;
      const prevNode = prevNodesMap.get(sourceOldPath);
      const prevField = prevNode?.field ?? prevFieldsMap.get(sourceOldPath);

      if (!prevNode && !renameNewToOld.has(path)) {
        report.addedFields.push(path);
        if (!nextNode.isRepeaterTemplate) {
          const nextDefault = getByPath(seeded, path);
          if (getByPath(this.values, path) === undefined && nextDefault !== undefined) {
            this.values = setByPath(this.values, path, deepClone(nextDefault));
          }
          if (getByPath(this.initialValues, path) === undefined && nextDefault !== undefined) {
            this.initialValues = setByPath(this.initialValues, path, deepClone(nextDefault));
          }
          this.externalValueVersion[path] = (this.externalValueVersion[path] ?? 0) + 1;
        }
        continue;
      }

      const fieldChanged =
        Boolean(prevField) &&
        (prevField!.type !== nextField.type ||
          !deepEqual(prevField!.options, nextField.options) ||
          !deepEqual(prevField!.upload, nextField.upload) ||
          !deepEqual(prevField!.formula, nextField.formula) ||
          !deepEqual(prevField!.computed, nextField.computed) ||
          !deepEqual(prevField!.validation, nextField.validation) ||
          prevField!.required !== nextField.required ||
          !deepEqual(
            prevConfig.defaults?.[sourceOldPath] ?? prevField!.defaultValue,
            this.config.defaults?.[path] ?? nextField.defaultValue
          ));

      if (fieldChanged) {
        report.modifiedFields.push(path);
      } else {
        report.preservedFields.push(path);
      }

      if (!nextNode.isRepeaterTemplate) {
        const currentVal = getByPath(this.values, path);
        const seededDefault = getByPath(seeded, path);
        const coerced = coerceReconciledFieldValue(
          currentVal,
          prevField,
          nextField,
          seededDefault
        );

        if (
          nextField.type === 'calculated' ||
          nextField.type === 'computed' ||
          nextField.formula ||
          nextField.computed
        ) {
          delete this.dirtyFields[path];
          delete this.errors[path];
          delete this.filesByField[path];
        } else if (coerced.replaced) {
          if (coerced.value === undefined) {
            this.values = deleteByPath(this.values, path);
          } else {
            this.values = setByPath(this.values, path, coerced.value);
          }
          if (seededDefault !== undefined) {
            this.initialValues = setByPath(this.initialValues, path, deepClone(seededDefault));
          } else {
            this.initialValues = deleteByPath(this.initialValues, path);
          }
          delete this.dirtyFields[path];
          delete this.touchedFields[path];
          delete this.errors[path];
          if (!UPLOAD_FIELD_TYPES.has(nextField.type)) {
            delete this.filesByField[path];
          }
          this.externalValueVersion[path] = (this.externalValueVersion[path] ?? 0) + 1;
          this.markFieldMutated(path);
        } else if (fieldChanged && this.errors[path]) {
          // Re-check existing error against updated validation rules
          const syncRes = this.validationEngine.validateSync(this.values, {
            onlyFields: [path],
            locale: this.locale,
          });
          if (syncRes.errors[path]) {
            this.errors[path] = syncRes.errors[path];
          } else {
            delete this.errors[path];
          }
        }

        if (UPLOAD_FIELD_TYPES.has(nextField.type) && this.filesByField[path]?.length) {
          const uploadConstraints = resolveUploadConstraints(
            nextField.type,
            nextField.upload
          );
          const { accepted } = validateSelectedFiles(
            this.filesByField[path],
            uploadConstraints
          );
          if (accepted.length === 0) {
            delete this.filesByField[path];
            this.values = setByPath(
              this.values,
              path,
              uploadConstraints.multiple ? [] : undefined
            );
          } else {
            this.filesByField[path] = accepted;
            this.values = setByPath(
              this.values,
              path,
              uploadConstraints.multiple ? accepted : accepted[0]
            );
          }
        }
      }
    }

    // 4. Seed defaultFormulas for newly added undefined paths & recompute formulas
    this.applyDefaultFormulas(this.values);
    const maxStep = Math.max(0, this.getVisibleSteps().length - 1);
    if (this.currentStepIndex > maxStep) {
      this.currentStepIndex = maxStep;
    }
    this.recomputeAllComputedFields(false);

    if (notify) {
      this.bumpAndNotifyAll();
    }

    return report;
  }

  private collectAllConfiguredFields(config: FormConfig): FieldConfig[] {
    const out: FieldConfig[] = [];
    const visit = (list?: readonly FieldConfig[]) => {
      if (!list) return;
      for (const f of list) {
        out.push(f);
        if (f.fields) visit(f.fields);
        if (f.steps) {
          for (const s of f.steps) visit(s.fields);
        }
      }
    };
    visit(config.fields);
    if (config.sections) {
      for (const sec of config.sections) {
        visit(sec.fields.filter((f): f is FieldConfig => typeof f !== 'string'));
      }
    }
    if (config.steps) {
      for (const s of config.steps) visit(s.fields);
    }
    return out;
  }

  private indexFieldsAndDependencies(): void {
    this.allFieldsMap.clear();
    this.reverseDependencyMap.clear();
    this.resetOnDepMap.clear();
    this.computedFields = [];

    const walk = (fields: readonly FieldConfig[] | undefined, prefix = '') => {
      if (!fields) return;
      for (const field of fields) {
        const path = field.name ? (prefix ? `${prefix}.${field.name}` : field.name) : prefix;
        if (field.name) {
          this.allFieldsMap.set(path, field);
          const deps = collectFieldDependencies(field);
          for (const dep of deps) {
            if (!this.reverseDependencyMap.has(dep)) {
              this.reverseDependencyMap.set(dep, new Set());
            }
            this.reverseDependencyMap.get(dep)!.add(path);
          }

          if (
            typeof field.dataSource === 'object' &&
            field.dataSource.dependsOn &&
            field.dataSource.resetOnDependencyChange !== false
          ) {
            for (const dep of field.dataSource.dependsOn) {
              if (!this.resetOnDepMap.has(dep)) {
                this.resetOnDepMap.set(dep, new Set());
              }
              this.resetOnDepMap.get(dep)!.add(path);
            }
          }

          if (
            field.type === 'computed' ||
            field.type === 'calculated' ||
            field.computed ||
            field.formula
          ) {
            this.computedFields.push({ path, field });
          }
        }

        if (field.fields) {
          walk(field.fields, field.type === 'objectGroup' && field.name ? path : prefix);
        }
        if (field.steps) {
          for (const s of field.steps) walk(s.fields, prefix);
        }
      }
    };

    walk(this.config.fields);
    if (this.config.sections) {
      for (const sec of this.config.sections) {
        walk(sec.fields.filter((f): f is FieldConfig => typeof f !== 'string'));
      }
    }
    if (this.config.steps) {
      for (const s of this.config.steps) walk(s.fields);
    }
  }

  public getConfig(): FormConfig {
    return this.config;
  }

  public getCompiledPlan(): CompiledFormPlan {
    return this.compiledPlan;
  }

  public getDependencyGraph(): DependencyGraph {
    return this.compiledPlan.graph;
  }

  public getConditionContext(concretePath?: string): ConditionEvaluationContext {
    return this.buildConditionContext(concretePath);
  }

  /**
   * Batches multiple synchronous state mutations so subscribers receive a single
   * coalesced notification pass after `fn()` completes.
   */
  public batch<T>(fn: () => T): T {
    this.batchDepth += 1;
    try {
      return fn();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0) {
        if (this.pendingBatchNotifyAll) {
          this.pendingBatchNotifyAll = false;
          this.pendingBatchPaths.clear();
          this.bumpAndNotifyAll();
        } else if (this.pendingBatchPaths.size > 0) {
          const paths = Array.from(this.pendingBatchPaths);
          this.pendingBatchPaths.clear();
          this.notifyPaths(paths);
        }
      }
    }
  }

  private extractRowScope(concretePath: string): {
    rowPrefix?: string;
    rowIndex?: number;
  } {
    const segs = concretePath.split('.');
    for (let i = segs.length - 2; i >= 0; i -= 1) {
      if (/^\d+$/.test(segs[i])) {
        return {
          rowPrefix: segs.slice(0, i + 1).join('.'),
          rowIndex: Number(segs[i]),
        };
      }
    }
    return {};
  }

  private buildConditionContext(concretePath?: string): ConditionEvaluationContext {
    const scope = concretePath ? this.extractRowScope(concretePath) : {};
    return {
      namedConditions: this.compiledPlan.namedConditions,
      registry: this.conditionRegistry,
      rowPrefix: scope.rowPrefix,
      rowIndex: scope.rowIndex,
    };
  }

  private applyDefaultFormulas(explicitInitialValues?: FormValues): void {
    for (const tplPath of this.compiledPlan.defaultFormulaPaths) {
      const node = this.compiledPlan.nodes.get(tplPath);
      if (!node?.defaultFormulaAst) continue;

      const targets = expandTargetTemplatePaths(tplPath, '', this.values);
      for (const concretePath of targets) {
        if (explicitInitialValues && getByPath(explicitInitialValues, concretePath) !== undefined) {
          continue;
        }
        const current = getByPath(this.values, concretePath);
        if (current !== undefined && current !== '') continue;

        const scope = this.extractRowScope(concretePath);
        const res = evaluateFormula(node.defaultFormulaAst, this.values, {
          ...scope,
          precision: node.field.precision,
        });
        if (res.value !== undefined) {
          this.values = setByPath(this.values, concretePath, res.value);
          this.externalValueVersion[concretePath] =
            (this.externalValueVersion[concretePath] ?? 0) + 1;
        }
      }
    }
  }

  private evaluateSingleFormulaNode(
    concretePath: string,
    node: CompiledFieldNode | undefined
  ): unknown {
    const scope = this.extractRowScope(concretePath);
    if (node?.formulaAst) {
      const res = evaluateFormula(node.formulaAst, this.values, {
        ...scope,
        functionRegistry: this.functionRegistry,
        precision: node.field.precision ?? node.field.computed?.precision,
      });
      return res.value;
    }

    const field = node?.field ?? this.allFieldsMap.get(concretePath);
    if (!field) return undefined;
    return evaluateComputedField(field, this.values, this.calculators, {
      ...scope,
      conditionContext: this.buildConditionContext(concretePath),
    });
  }

  private recomputeFormulasByConcretePaths(
    concretePaths: readonly string[],
    notifyListeners: boolean
  ): string[] {
    const changedComputedPaths: string[] = [];
    for (const concretePath of concretePaths) {
      const node =
        this.compiledPlan.nodes.get(concretePath) ??
        this.compiledPlan.nodes.get(toWildcardTemplatePath(concretePath));
      const nextVal = this.evaluateSingleFormulaNode(concretePath, node);
      const prevVal = getByPath(this.values, concretePath);
      if (!deepEqual(prevVal, nextVal)) {
        this.values = setByPath(this.values, concretePath, nextVal);
        this.externalValueVersion[concretePath] =
          (this.externalValueVersion[concretePath] ?? 0) + 1;
        changedComputedPaths.push(concretePath);
      }
    }
    if (notifyListeners && changedComputedPaths.length > 0) {
      this.notifyPaths(changedComputedPaths);
    }
    return changedComputedPaths;
  }

  private recomputeAllComputedFields(notifyListeners: boolean): string[] {
    const orderedConcrete: string[] = [];
    for (const tplPath of this.compiledPlan.formulaEvalOrder) {
      const expanded = expandTargetTemplatePaths(tplPath, '', this.values);
      for (const p of expanded) {
        orderedConcrete.push(p);
      }
    }
    return this.recomputeFormulasByConcretePaths(orderedConcrete, notifyListeners);
  }

  private setupDraftPersistence(): void {
    const draftCfg = this.config.draft ?? this.config.persistence;
    if (!draftCfg?.enabled || !this.storageAdapter) return;

    const key = draftCfg.storageKey ?? draftCfg.key ?? `expo-form-draft:${this.config.id}`;
    const debounceMs = draftCfg.debounceMs ?? 500;

    const getEffectiveDraftOmissionSet = (): ReadonlySet<string> =>
      draftCfg.excludeSensitive === false && this.config.security?.protectSensitiveFields === false
        ? this.builtInSecretPaths
        : this.sensitivePaths;

    this.draftSaveDebouncer = createDebounced(() => {
      if (!this.storageAdapter) return;
      const toPersist = omitSensitiveValues(this.values, getEffectiveDraftOmissionSet());
      try {
        void Promise.resolve(this.storageAdapter.setItem(key, JSON.stringify(toPersist)));
      } catch {
        // Ignore storage write errors
      }
    }, debounceMs);

    const applyRestoredDraft = (raw: string | null | undefined) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      const sanitized = omitSensitiveValues(
        parsed as FormValues,
        getEffectiveDraftOmissionSet()
      );
      this.setValues(sanitized, { shouldValidate: false });
    };

    // Restore persisted draft if available (synchronously if sync storage, else async)
    try {
      const maybeRaw = this.storageAdapter.getItem(key);
      if (typeof maybeRaw === 'string') {
        applyRestoredDraft(maybeRaw);
      } else if (maybeRaw && typeof (maybeRaw as PromiseLike<string | null>).then === 'function') {
        const restoreEpoch = this.formValidationEpoch;
        void Promise.resolve(maybeRaw)
          .then((raw) => {
            if (this.formValidationEpoch !== restoreEpoch) return;
            applyRestoredDraft(raw);
          })
          .catch(() => {});
      }
    } catch {
      // Ignore storage read errors
    }
  }

  public dispose(): void {
    this.fieldValidateDebouncers.forEach((d) => d.cancel());
    this.fieldValidateDebouncers.clear();
    this.draftSaveDebouncer?.cancel();
    this.validationEngine.abortAsyncValidation();
    this.isSubmitting = false;
    this.isAdvancingStep = false;
  }

  public async saveDraft(): Promise<void> {
    if (!this.storageAdapter) return;
    const draftCfg = this.config.draft ?? this.config.persistence;
    const key = draftCfg?.storageKey ?? draftCfg?.key ?? `expo-form-draft:${this.config.id}`;
    const omissionSet =
      draftCfg?.excludeSensitive === false &&
      this.config.security?.protectSensitiveFields === false
        ? this.builtInSecretPaths
        : this.sensitivePaths;
    const toPersist = omitSensitiveValues(this.values, omissionSet);
    await Promise.resolve(this.storageAdapter.setItem(key, JSON.stringify(toPersist)));
  }

  public async clearDraft(): Promise<void> {
    this.draftSaveDebouncer?.cancel();
    if (!this.storageAdapter) return;
    const draftCfg = this.config.draft ?? this.config.persistence;
    const key = draftCfg?.storageKey ?? draftCfg?.key ?? `expo-form-draft:${this.config.id}`;
    await Promise.resolve(this.storageAdapter.removeItem(key));
  }

  // ===========================================================================
  // Subscriptions & Snapshots
  // ===========================================================================

  public subscribePaths(paths: readonly string[], listener: () => void): () => void {
    if (paths.length === 0) {
      this.globalListeners.add(listener);
      return () => {
        this.globalListeners.delete(listener);
      };
    }

    return this.pathSubscriptionIndex.subscribe(paths, listener);
  }

  public subscribeGlobal(listener: () => void): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  public getSubscriptionDiagnostics(): {
    subscribedPathCount: number;
    prefixBucketCount: number;
    lastNotifyBucketsInspected: number;
  } {
    return {
      ...this.pathSubscriptionIndex.getStats(),
      lastNotifyBucketsInspected: this.lastNotifyBucketsInspected,
    };
  }

  public getVersion(): number {
    return this.snapshotVersion;
  }

  private notifyPaths(paths: readonly string[]): void {
    if (this.batchDepth > 0) {
      for (const p of paths) this.pendingBatchPaths.add(p);
      return;
    }

    this.snapshotVersion += 1;
    const toCall = new Set<() => void>();
    let inspected = 0;

    for (const p of paths) {
      inspected += this.pathSubscriptionIndex.collectHierarchy(p, toCall);

      const dependents = this.reverseDependencyMap.get(p);
      if (dependents) {
        for (const depPath of dependents) {
          inspected += this.pathSubscriptionIndex.collectExact(depPath, toCall);
        }
      }
      const graphDependents = this.compiledPlan.graph.getDirectDependents(p);
      for (const depTpl of graphDependents) {
        for (const depPath of expandTargetTemplatePaths(depTpl, p, this.values)) {
          inspected += this.pathSubscriptionIndex.collectExact(depPath, toCall);
        }
      }
    }

    this.lastNotifyBucketsInspected = inspected;

    for (const fn of this.globalListeners) {
      toCall.add(fn);
    }

    for (const fn of toCall) {
      fn();
    }
  }

  private bumpAndNotifyAll(): void {
    if (this.batchDepth > 0) {
      this.pendingBatchNotifyAll = true;
      return;
    }
    this.snapshotVersion += 1;
    const toCall = new Set<() => void>(this.globalListeners);
    this.pathSubscriptionIndex.collectAll(toCall);
    for (const fn of toCall) fn();
  }

  // ===========================================================================
  // Focus Registration & Navigation
  // ===========================================================================

  public registerFocusHandle(fieldPath: string, handle: FocusableFieldHandle | null): void {
    if (handle) {
      this.focusHandles.set(fieldPath, handle);
    } else {
      this.focusHandles.delete(fieldPath);
    }
  }

  public focusField(fieldPath: string): void {
    const handle = this.focusHandles.get(fieldPath);
    this.onScrollToField?.(fieldPath, { willFocusField: Boolean(handle) });
    handle?.focus();
  }

  public blurField(fieldPath?: string): void {
    const target = fieldPath ?? this.focusedField;
    if (target) {
      this.focusHandles.get(target)?.blur?.();
    } else {
      Keyboard?.dismiss?.();
    }
  }

  public getOrderedEditableVisibleFieldPaths(): string[] {
    const active = collectActiveFields(this.config, this.values);
    const steps = this.getVisibleSteps();
    let stepFieldNames: Set<string> | null = null;
    if (steps.length > 0) {
      const activeStep = steps[this.currentStepIndex] ?? steps[0];
      stepFieldNames = new Set();
      const collectNames = (list: readonly FieldConfig[], prefix = '') => {
        for (const f of list) {
          const p = f.name ? (prefix ? `${prefix}.${f.name}` : f.name) : prefix;
          if (f.name) stepFieldNames!.add(p);
          if (f.fields) collectNames(f.fields, f.type === 'objectGroup' && f.name ? p : prefix);
        }
      };
      collectNames(activeStep.fields);
    }

    return active
      .filter((d) => {
        if (!d.parentVisible) return false;
        const condCtx = this.buildConditionContext(d.path);
        if (stepFieldNames && !stepFieldNames.has(d.path)) return false;
        if (isFieldReadOnly(d.field, this.values, this.formReadOnly, condCtx)) return false;
        if (!isFieldEnabled(d.field, this.values, this.formDisabled, condCtx)) return false;
        if (
          d.field.type === 'hidden' ||
          d.field.type === 'readOnly' ||
          d.field.type === 'computed' ||
          d.field.type === 'calculated'
        ) {
          return false;
        }
        return this.focusHandles.has(d.path) || true;
      })
      .map((d) => d.path);
  }

  public handleSubmitEditing(fromFieldPath: string, explicitNextField?: string): void {
    const kb = this.config.keyboard;
    if (explicitNextField === 'submit') {
      void this.submit();
      return;
    }
    if (explicitNextField && this.focusHandles.has(explicitNextField)) {
      this.focusField(explicitNextField);
      return;
    }

    if (kb?.autoAdvanceFocus === false) return;

    const ordered = this.getOrderedEditableVisibleFieldPaths().filter((p) =>
      this.focusHandles.has(p)
    );
    const idx = ordered.indexOf(fromFieldPath);
    if (idx >= 0 && idx < ordered.length - 1) {
      this.focusField(ordered[idx + 1]);
      return;
    }

    if (kb?.submitOnLastField !== false) {
      void this.submit();
    } else {
      this.blurField(fromFieldPath);
    }
  }

  // ===========================================================================
  // Field Value Reading & Updating
  // ===========================================================================

  public getValues(): FormValues {
    return deepClone(this.values);
  }

  public getValuesRef(): FormValues {
    return this.values;
  }

  public getValue(fieldPath: string): unknown {
    return getByPath(this.values, fieldPath);
  }

  public getExternalVersion(fieldPath: string): number {
    let ver = this.externalValueVersion[fieldPath] ?? 0;
    let dotIdx = fieldPath.indexOf('.');
    while (dotIdx !== -1) {
      const ancestor = fieldPath.slice(0, dotIdx);
      ver += this.externalValueVersion[ancestor] ?? 0;
      dotIdx = fieldPath.indexOf('.', dotIdx + 1);
    }
    return ver;
  }

  public getFieldState(fieldPath: string, fieldOverride?: FieldConfig): FieldRuntimeState {
    const compiledNode =
      this.compiledPlan.nodes.get(fieldPath) ??
      this.compiledPlan.nodes.get(toWildcardTemplatePath(fieldPath));
    const field = fieldOverride ?? compiledNode?.field ?? this.allFieldsMap.get(fieldPath);
    const val = getByPath(this.values, fieldPath);
    const initVal = getByPath(this.initialValues, fieldPath);
    const touched = Boolean(this.touchedFields[fieldPath]);
    const showAfterTouch = this.config.validation?.showErrorsAfterTouch ?? true;
    const onlyAfterSubmit = this.config.validation?.onlyAfterFirstSubmit ?? false;

    const canShowError =
      this.submitCount > 0 || (!onlyAfterSubmit && (!showAfterTouch || touched));

    const rawError = this.errors[fieldPath];
    const condCtx = this.buildConditionContext(fieldPath);

    return {
      value: val,
      initialValue: initVal,
      dirty: Boolean(this.dirtyFields[fieldPath]),
      touched,
      focused: this.focusedField === fieldPath,
      validating: Boolean(this.validatingFields[fieldPath]),
      visible: field ? isFieldVisible(field, this.values, condCtx) : true,
      enabled: field
        ? isFieldEnabled(field, this.values, this.formDisabled, condCtx)
        : !this.formDisabled,
      readOnly: field
        ? isFieldReadOnly(field, this.values, this.formReadOnly, condCtx)
        : this.formReadOnly,
      required: field
        ? isFieldRequired(
            field,
            this.values,
            this.validationEngine.getSchemaRequiredSet(),
            fieldPath,
            condCtx
          )
        : false,
      error: canShowError ? rawError : undefined,
      files: this.filesByField[fieldPath],
    };
  }

  public getRawError(fieldPath: string): string | undefined {
    return this.errors[fieldPath];
  }

  /**
   * Lightweight form-level metadata selector without deep-cloning `values` or `initialValues`.
   * Keeps top-level `FormRenderer` updates O(1) on large forms and repeaters.
   */
  public getFormMeta(): {
    submitStatus: FormSubmitStatus;
    isDirty: boolean;
    isValid: boolean;
    formErrors: readonly string[];
    currentStepIndex: number;
    totalSteps: number;
  } {
    const isDirty = Object.values(this.dirtyFields).some(Boolean);
    const isValid = Object.keys(this.errors).length === 0 && this.formErrors.length === 0;
    const totalSteps = this.getVisibleSteps().length;
    return {
      submitStatus: this.submitStatus,
      isDirty,
      isValid,
      formErrors: this.formErrors,
      currentStepIndex: this.currentStepIndex,
      totalSteps,
    };
  }

  public getState(): FormStateSnapshot {
    const isDirty = Object.values(this.dirtyFields).some(Boolean);
    const isValid = Object.keys(this.errors).length === 0 && this.formErrors.length === 0;
    return {
      values: deepClone(this.values),
      initialValues: deepClone(this.initialValues),
      errors: { ...this.errors },
      formErrors: [...this.formErrors],
      dirtyFields: { ...this.dirtyFields },
      touchedFields: { ...this.touchedFields },
      validatingFields: { ...this.validatingFields },
      filesByField: deepClone(this.filesByField),
      focusedField: this.focusedField,
      isDirty,
      isValid,
      submitCount: this.submitCount,
      submitStatus: this.submitStatus,
      currentStepIndex: this.currentStepIndex,
    };
  }

  /**
   * Called by native input controls when the user edits a value directly.
   * Does NOT bump `externalValueVersion` for `fieldPath`, preventing cursor resets.
   */
  public setValueFromUserInput(fieldPath: string, value: unknown): void {
    this.internalSetValue(fieldPath, value, {
      isProgrammatic: false,
      shouldDirty: true,
      shouldTouch: false,
    });
  }

  /**
   * Called programmatically (`formRef.current.setValue`, reset, prefill, clear button, picker).
   * Bumps `externalValueVersion` so `useNativeState` syncs cleanly to the native view.
   */
  public setValue(
    fieldPath: string,
    value: unknown,
    options?: { shouldValidate?: boolean; shouldDirty?: boolean; shouldTouch?: boolean }
  ): void {
    this.internalSetValue(fieldPath, value, {
      isProgrammatic: true,
      shouldValidate: options?.shouldValidate,
      shouldDirty: options?.shouldDirty ?? true,
      shouldTouch: options?.shouldTouch ?? false,
    });
  }

  private markFieldMutated(fieldPath: string): void {
    this.fieldValueVersion[fieldPath] = (this.fieldValueVersion[fieldPath] ?? 0) + 1;
    this.fieldValidationSeq[fieldPath] = (this.fieldValidationSeq[fieldPath] ?? 0) + 1;
    this.validationEngine.abortAsyncValidation(fieldPath);
    this.validationEngine.invalidateAsyncCache(fieldPath);
    if (this.validatingFields[fieldPath]) {
      this.validatingFields[fieldPath] = false;
    }
  }

  public setValues(
    partialValues: FormValues,
    options?: { shouldValidate?: boolean }
  ): void {
    const affected: string[] = [];
    for (const [path, val] of Object.entries(partialValues)) {
      const prev = getByPath(this.values, path);
      this.values = setByPath(this.values, path, val);
      this.externalValueVersion[path] = (this.externalValueVersion[path] ?? 0) + 1;
      if (!deepEqual(prev, val)) {
        this.markFieldMutated(path);
      }
      const initVal = getByPath(this.initialValues, path);
      this.dirtyFields[path] = !deepEqual(val, initVal);
      affected.push(path);
    }
    const computedChanged = this.recomputeAllComputedFields(false);
    for (const cPath of computedChanged) {
      this.markFieldMutated(cPath);
    }
    affected.push(...computedChanged);
    this.notifyPaths(affected);

    if (options?.shouldValidate) {
      void this.validate();
    }
  }

  private internalSetValue(
    fieldPath: string,
    value: unknown,
    opts: {
      isProgrammatic: boolean;
      shouldValidate?: boolean;
      shouldDirty?: boolean;
      shouldTouch?: boolean;
    }
  ): void {
    const prev = getByPath(this.values, fieldPath);
    const valueChanged = !deepEqual(prev, value);
    if (!valueChanged && !opts.isProgrammatic) {
      return;
    }

    this.values = setByPath(this.values, fieldPath, value);
    const isStructuralArrayMutation = Array.isArray(prev) || Array.isArray(value);
    if (opts.isProgrammatic || isStructuralArrayMutation) {
      this.externalValueVersion[fieldPath] = (this.externalValueVersion[fieldPath] ?? 0) + 1;
    }
    if (valueChanged) {
      this.markFieldMutated(fieldPath);
      if (Array.isArray(prev) && Array.isArray(value) && value.length !== prev.length) {
        const childPrefix = `${fieldPath}.`;
        for (const key of Object.keys(this.errors)) {
          if (key.startsWith(childPrefix)) delete this.errors[key];
        }
        for (const key of Object.keys(this.touchedFields)) {
          if (key.startsWith(childPrefix)) delete this.touchedFields[key];
        }
        for (const key of Object.keys(this.dirtyFields)) {
          if (key.startsWith(childPrefix)) delete this.dirtyFields[key];
        }
      }
    }

    if (opts.shouldDirty !== false) {
      const initVal = getByPath(this.initialValues, fieldPath);
      this.dirtyFields[fieldPath] = !deepEqual(value, initVal);
    }
    if (opts.shouldTouch) {
      this.touchedFields[fieldPath] = true;
    }

    const affectedPaths = [fieldPath];
    const evalPlan = this.compiledPlan.graph.getEvaluationPlan([fieldPath], this.values);

    // 1. Reset dependent selection fields transitively (e.g. changing country clears state & city)
    if (evalPlan.dataSourcesToReset.length > 0 && valueChanged) {
      for (const target of evalPlan.dataSourcesToReset) {
        const targetNode =
          this.compiledPlan.nodes.get(target) ??
          this.compiledPlan.nodes.get(toWildcardTemplatePath(target));
        const targetField = targetNode?.field ?? this.allFieldsMap.get(target);
        const emptyVal = targetField ? defaultEmptyForField(targetField) ?? '' : '';
        if (!deepEqual(getByPath(this.values, target), emptyVal)) {
          this.values = setByPath(this.values, target, emptyVal);
          this.externalValueVersion[target] = (this.externalValueVersion[target] ?? 0) + 1;
          this.markFieldMutated(target);
          delete this.errors[target];
          affectedPaths.push(target);
        }
      }
    }

    // 2. Incrementally recompute ONLY affected formula/computed fields in topological order!
    const computedChanged = this.recomputeFormulasByConcretePaths(
      evalPlan.formulasToEvaluate,
      false
    );
    for (const cPath of computedChanged) {
      this.markFieldMutated(cPath);
    }
    affectedPaths.push(...computedChanged, ...evalPlan.affectedFields);

    // Clear error when corrected if configured
    const valCfg = this.config.validation;
    const clearOnChange = valCfg?.clearErrorsOnChange ?? true;
    if (clearOnChange && this.errors[fieldPath]) {
      const check = this.validationEngine.validateSync(this.values, {
        onlyFields: [fieldPath],
        locale: this.locale,
      });
      if (!check.errors[fieldPath]) {
        delete this.errors[fieldPath];
      }
    }

    if (this.submitStatus === 'success' || this.submitStatus === 'failure') {
      this.submitStatus = 'idle';
    }

    this.notifyPaths(affectedPaths);

    // Schedule validation according to configured timing mode
    const mode = valCfg?.mode ?? 'onBlur';
    const shouldValidateOnChange =
      opts.shouldValidate ??
      (valCfg?.validateOnChange === true || mode === 'onChange' || mode === 'immediate');

    const blockedUntilSubmit = Boolean(valCfg?.onlyAfterFirstSubmit && this.submitCount === 0);

    const validationDependents = new Set<string>([
      ...(this.reverseDependencyMap.get(fieldPath) ?? []),
      ...evalPlan.validationsToReRun,
    ]);

    if (shouldValidateOnChange && !blockedUntilSubmit) {
      const dependentFieldsToRevalidate = Array.from(validationDependents).filter(
        (dep) => this.touchedFields[dep] || this.submitCount > 0
      );
      this.scheduleChangeValidation(fieldPath, dependentFieldsToRevalidate);
    } else {
      // Still revalidate touched dependent cross-fields (e.g. confirmPassword when password changes!)
      const touchedDeps = Array.from(validationDependents).filter(
        (dep) => this.touchedFields[dep] || this.submitCount > 0
      );
      if (touchedDeps.length > 0) {
        this.runSyncValidationForFields(touchedDeps);
      }
    }

    // Trigger draft persistence
    this.draftSaveDebouncer?.();

    // Emit public callbacks
    const isDirty = Object.values(this.dirtyFields).some(Boolean);
    const snapshotValues = this.getValues();
    this.callbacks.onFieldChange?.(fieldPath, value, snapshotValues);
    this.callbacks.onChange?.(snapshotValues, { changedField: fieldPath, isDirty });
  }

  private scheduleChangeValidation(fieldPath: string, extraPaths: string[]): void {
    const debounceMs =
      this.config.validation?.mode === 'immediate'
        ? 0
        : (this.config.validation?.debounceMs ?? 0);

    let debouncer = this.fieldValidateDebouncers.get(fieldPath);
    if (!debouncer) {
      debouncer = createDebounced((targetPath: string) => {
        void this.validate(targetPath, 'onChange');
      }, debounceMs);
      this.fieldValidateDebouncers.set(fieldPath, debouncer);
    }

    debouncer(fieldPath);
    if (extraPaths.length > 0) {
      this.runSyncValidationForFields(extraPaths);
    }
  }

  private runSyncValidationForFields(paths: readonly string[]): void {
    const res = this.validationEngine.validateSync(this.values, {
      onlyFields: paths,
      locale: this.locale,
    });
    for (const p of paths) {
      if (res.errors[p]) {
        this.errors[p] = res.errors[p];
      } else {
        delete this.errors[p];
      }
    }
    this.notifyPaths(paths);
  }

  // ===========================================================================
  // Focus / Blur Lifecycle
  // ===========================================================================

  public handleFocus(fieldPath: string): void {
    const prevFocus = this.focusedField;
    this.focusedField = fieldPath;
    const notifyList = prevFocus && prevFocus !== fieldPath ? [prevFocus, fieldPath] : [fieldPath];
    this.notifyPaths(notifyList);
    this.callbacks.onFocus?.(fieldPath);
  }

  public handleBlur(fieldPath: string): void {
    this.touchedFields[fieldPath] = true;
    if (this.focusedField === fieldPath) {
      this.focusedField = null;
    }

    const valCfg = this.config.validation;
    const mode = valCfg?.mode ?? 'onBlur';
    const validateOnBlur = valCfg?.validateOnBlur ?? (mode === 'onBlur' || mode === 'immediate');
    const blockedUntilSubmit = Boolean(valCfg?.onlyAfterFirstSubmit && this.submitCount === 0);

    if (validateOnBlur && !blockedUntilSubmit) {
      void this.validate(fieldPath, 'onBlur');
    } else {
      this.notifyPaths([fieldPath]);
    }

    this.callbacks.onBlur?.(fieldPath, getByPath(this.values, fieldPath));
  }

  // ===========================================================================
  // Files Management
  // ===========================================================================

  public setFieldFiles(fieldPath: string, files: FormFileAsset[], multiple = false): void {
    this.filesByField[fieldPath] = files;
    this.touchedFields[fieldPath] = true;
    const valuePayload = multiple ? files : (files[0] ?? null);
    this.setValue(fieldPath, valuePayload, { shouldValidate: true, shouldTouch: true });
    this.callbacks.onFilesSelected?.(fieldPath, files);
  }

  // ===========================================================================
  // Error Management & Validation API
  // ===========================================================================

  public setError(fieldPath: string, message: string): void {
    this.errors[fieldPath] = message;
    this.touchedFields[fieldPath] = true;
    this.announceError(message);
    this.notifyPaths([fieldPath]);
  }

  public setServerErrors(fieldErrors: Record<string, string>, formErrors?: string[]): void {
    const paths = Object.keys(fieldErrors);
    for (const [k, msg] of Object.entries(fieldErrors)) {
      this.errors[k] = msg;
      this.touchedFields[k] = true;
    }
    if (formErrors) {
      this.formErrors = [...formErrors];
    }
    const firstMsg = fieldErrors[paths[0]] ?? formErrors?.[0];
    if (firstMsg) this.announceError(firstMsg);
    this.notifyPaths(paths);
  }

  public setServerErrorsFromPayload(payload: unknown): {
    fieldErrors: Record<string, string>;
    formErrors: string[];
  } {
    const normalized = normalizeServerValidationErrors(payload);
    this.setServerErrors(normalized.fieldErrors, normalized.formErrors);
    return normalized;
  }

  public clearErrors(fieldPath?: string): void {
    if (fieldPath) {
      delete this.errors[fieldPath];
      this.notifyPaths([fieldPath]);
      return;
    }
    const prevPaths = Object.keys(this.errors);
    this.errors = {};
    this.formErrors = [];
    this.notifyPaths(prevPaths);
  }

  private fieldHasAsyncValidation(fieldPath: string): boolean {
    const node =
      this.compiledPlan.nodes.get(fieldPath) ??
      this.compiledPlan.nodes.get(toWildcardTemplatePath(fieldPath));
    if (node && node.asyncRules.length > 0) return true;
    const f = this.allFieldsMap.get(fieldPath);
    return Boolean(f?.validation?.async);
  }

  public async validate(
    fieldPath?: string,
    trigger: 'onBlur' | 'onChange' | 'onSubmit' = 'onSubmit'
  ): Promise<ValidationResult> {
    const onlyFields = fieldPath ? [fieldPath] : undefined;
    const myEpoch = this.formValidationEpoch;

    if (fieldPath) {
      const valuesSnapshot = deepClone(this.values);
      const startValueVer = this.fieldValueVersion[fieldPath] ?? 0;
      const reqSeq = (this.fieldValidationSeq[fieldPath] =
        (this.fieldValidationSeq[fieldPath] ?? 0) + 1);

      if (this.fieldHasAsyncValidation(fieldPath)) {
        this.validatingFields[fieldPath] = true;
        this.notifyPaths([fieldPath]);
      }

      const result = await this.validationEngine.validateAsync(
        valuesSnapshot,
        this.asyncValidators,
        {
          onlyFields,
          trigger,
          locale: this.locale,
          isFieldStale: (p, validatedValue) =>
            this.formValidationEpoch !== myEpoch ||
            (this.fieldValueVersion[p] ?? 0) !== startValueVer ||
            !deepEqual(getByPath(this.values, p), validatedValue),
        }
      );

      // Discard stale async results if the field value mutated, a newer validation started, or form reset
      const isStale =
        this.formValidationEpoch !== myEpoch ||
        (this.fieldValueVersion[fieldPath] ?? 0) !== startValueVer ||
        this.fieldValidationSeq[fieldPath] !== reqSeq;

      if (isStale) {
        if (this.fieldValidationSeq[fieldPath] === reqSeq && this.validatingFields[fieldPath]) {
          this.validatingFields[fieldPath] = false;
          this.notifyPaths([fieldPath]);
        }
        return this.validationEngine.validateSync(this.values, {
          onlyFields: [fieldPath],
          locale: this.locale,
        });
      }

      this.validatingFields[fieldPath] = false;
      if (result.errors[fieldPath]) {
        this.errors[fieldPath] = result.errors[fieldPath];
      } else {
        delete this.errors[fieldPath];
      }
      this.notifyPaths([fieldPath]);
      this.callbacks.onValidation?.(result);
      return result;
    }

    // Full-form validation with bounded stabilization against mid-flight async value mutations
    const MAX_STABILIZATION_PASSES = 3;
    let finalResult: ValidationResult | null = null;
    const allTouchedAsyncPaths = new Set<string>();

    for (let pass = 0; pass < MAX_STABILIZATION_PASSES; pass += 1) {
      const valuesSnapshot = deepClone(this.values);
      const startFieldVersions: Record<string, number> = { ...this.fieldValueVersion };
      const asyncFieldPaths: string[] = [];
      const startSeqByField: Record<string, number> = {};

      for (const d of collectActiveFields(this.config, valuesSnapshot)) {
        if (
          d.parentVisible &&
          (d.field.validation?.async || this.fieldHasAsyncValidation(d.path))
        ) {
          asyncFieldPaths.push(d.path);
          allTouchedAsyncPaths.add(d.path);
          const seq = (this.fieldValidationSeq[d.path] =
            (this.fieldValidationSeq[d.path] ?? 0) + 1);
          startSeqByField[d.path] = seq;
          this.validatingFields[d.path] = true;
        }
      }
      if (asyncFieldPaths.length > 0) {
        this.notifyPaths(asyncFieldPaths);
      }

      const result = await this.validationEngine.validateAsync(
        valuesSnapshot,
        this.asyncValidators,
        {
          onlyFields,
          trigger,
          locale: this.locale,
          isFieldStale: (p, validatedValue) =>
            this.formValidationEpoch !== myEpoch ||
            (this.fieldValueVersion[p] ?? 0) !== (startFieldVersions[p] ?? 0) ||
            !deepEqual(getByPath(this.values, p), validatedValue),
        }
      );

      if (this.formValidationEpoch !== myEpoch) {
        return this.validationEngine.validateSync(this.values, { locale: this.locale });
      }

      for (const p of asyncFieldPaths) {
        if (this.fieldValidationSeq[p] === startSeqByField[p]) {
          this.validatingFields[p] = false;
        }
      }

      const mutatedDuringAwait = Object.keys(this.fieldValueVersion).filter(
        (p) => (this.fieldValueVersion[p] ?? 0) !== (startFieldVersions[p] ?? 0)
      );

      if (mutatedDuringAwait.length === 0) {
        finalResult = result;
        break;
      }

      // Check whether any mutated field (or dependent async field) requires async re-verification
      const mutatedRequiresAsync = mutatedDuringAwait.some((mutPath) => {
        if (this.fieldHasAsyncValidation(mutPath)) return true;
        const plan = this.compiledPlan.graph.getEvaluationPlan([mutPath], this.values);
        return plan.validationsToReRun.some((depPath) =>
          this.fieldHasAsyncValidation(depPath)
        );
      });

      if (mutatedRequiresAsync) {
        if (pass < MAX_STABILIZATION_PASSES - 1) {
          continue;
        }
        // Fail closed after max stabilization passes so unverified async edits never submit
        const freshSync = this.validationEngine.validateSync(this.values, {
          locale: this.locale,
        });
        const mergedErrors = { ...result.errors, ...freshSync.errors };
        const mergedDetails = { ...result.errorDetails, ...freshSync.errorDetails };
        for (const mutPath of mutatedDuringAwait) {
          if (this.fieldHasAsyncValidation(mutPath) && !mergedErrors[mutPath]) {
            const pendingMsg = 'Validation in progress; please wait for verification to finish.';
            mergedErrors[mutPath] = pendingMsg;
            mergedDetails[mutPath] = [
              {
                field: mutPath,
                rule: 'asyncPending',
                message: pendingMsg,
                source: 'async',
              },
            ];
          }
        }
        finalResult = {
          valid: false,
          errors: mergedErrors,
          errorDetails: mergedDetails,
          formErrors: [...freshSync.formErrors],
          firstErrorField: Object.keys(mergedErrors)[0],
        };
        break;
      }

      // Only purely synchronous fields changed: re-run full sync validation (including cross-field & AJV)
      // and preserve verified async errors on non-mutated fields.
      const freshSyncFull = this.validationEngine.validateSync(this.values, {
        locale: this.locale,
      });
      const mergedErrors = { ...freshSyncFull.errors };
      const mergedDetails = { ...freshSyncFull.errorDetails };
      for (const [errPath, errMsg] of Object.entries(result.errors)) {
        if (!mutatedDuringAwait.includes(errPath) && !mergedErrors[errPath]) {
          mergedErrors[errPath] = errMsg;
          mergedDetails[errPath] = result.errorDetails[errPath];
        }
      }
      finalResult = {
        valid:
          Object.keys(mergedErrors).length === 0 && freshSyncFull.formErrors.length === 0,
        errors: mergedErrors,
        errorDetails: mergedDetails,
        formErrors: [...freshSyncFull.formErrors],
        firstErrorField:
          Object.keys(mergedErrors)[0] ?? freshSyncFull.firstErrorField ?? undefined,
      };
      break;
    }

    const resolvedResult =
      finalResult ?? this.validationEngine.validateSync(this.values, { locale: this.locale });

    const prevKeys = Object.keys(this.errors);
    this.errors = { ...resolvedResult.errors };
    this.formErrors = [...resolvedResult.formErrors];
    this.notifyPaths([
      ...prevKeys,
      ...Object.keys(resolvedResult.errors),
      ...Array.from(allTouchedAsyncPaths),
    ]);

    this.callbacks.onValidation?.(resolvedResult);
    return resolvedResult;
  }

  private announceError(message: string): void {
    if (this.config.accessibility?.announceValidationErrors === false) return;
    if (typeof AccessibilityInfo?.announceForAccessibility === 'function') {
      try {
        AccessibilityInfo.announceForAccessibility(message);
      } catch {
        // Ignore on unsupported runtimes
      }
    }
  }

  // ===========================================================================
  // Multi-Step Wizard Navigation
  // ===========================================================================

  public getVisibleSteps() {
    const rawSteps =
      this.config.steps ??
      this.config.fields?.find((f) => f.type === 'stepGroup')?.steps ??
      [];
    const condCtx = this.buildConditionContext();
    return rawSteps.filter(
      (s) => !s.visibleWhen || evaluateCondition(s.visibleWhen, this.values, condCtx)
    );
  }

  private isStepSkipped(step: { skipWhen?: import('../types').ConditionExpression }): boolean {
    if (!step.skipWhen) return false;
    return evaluateCondition(step.skipWhen, this.values, this.buildConditionContext());
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public async nextStep(): Promise<boolean> {
    if (this.isAdvancingStep || this.isSubmitting || this.externalLoading) return false;
    const steps = this.getVisibleSteps();
    if (steps.length === 0 || this.currentStepIndex >= steps.length - 1) return false;

    this.isAdvancingStep = true;
    const myEpoch = this.formValidationEpoch;

    try {
      const currentStep = steps[this.currentStepIndex];
      if (currentStep.validateBeforeNext !== false) {
        let stepVerified = false;

        for (let pass = 0; pass < 2; pass += 1) {
          const stepDescriptors = collectActiveFields(
            { id: this.config.id, fields: currentStep.fields },
            this.values
          );
          const stepFieldPaths = stepDescriptors
            .filter((d) => d.parentVisible)
            .map((d) => d.path);

          for (const p of stepFieldPaths) {
            this.touchedFields[p] = true;
          }

          const startVersions: Record<string, number> = {};
          for (const p of stepFieldPaths) {
            startVersions[p] = this.fieldValueVersion[p] ?? 0;
          }

          const res = await this.validationEngine.validateAsync(
            deepClone(this.values),
            this.asyncValidators,
            {
              onlyFields: stepFieldPaths,
              trigger: 'onSubmit',
              locale: this.locale,
              isFieldStale: (p, validatedValue) =>
                this.formValidationEpoch !== myEpoch ||
                (this.fieldValueVersion[p] ?? 0) !== (startVersions[p] ?? 0) ||
                !deepEqual(getByPath(this.values, p), validatedValue),
            }
          );

          if (this.formValidationEpoch !== myEpoch) {
            return false;
          }

          const stepMutatedDuringAwait = stepFieldPaths.some(
            (p) => (this.fieldValueVersion[p] ?? 0) !== (startVersions[p] ?? 0)
          );

          if (stepMutatedDuringAwait) {
            if (pass === 0) {
              continue;
            }
            // Step values kept mutating across retries; refuse advancing with unverified input
            return false;
          }

          for (const p of stepFieldPaths) {
            if (res.errors[p]) this.errors[p] = res.errors[p];
            else delete this.errors[p];
          }
          this.notifyPaths(stepFieldPaths);

          if (!res.valid) {
            if (res.firstErrorField) {
              this.handleInvalidFocusAndScroll(
                res.firstErrorField,
                res.errors[res.firstErrorField]
              );
            }
            return false;
          }
          stepVerified = true;
          break;
        }

        if (!stepVerified) {
          return false;
        }
      }

      const freshSteps = this.getVisibleSteps();
      let candidateIdx = this.currentStepIndex + 1;
      while (
        candidateIdx < freshSteps.length &&
        this.isStepSkipped(freshSteps[candidateIdx])
      ) {
        candidateIdx += 1;
      }
      if (candidateIdx >= freshSteps.length) return false;
      this.currentStepIndex = candidateIdx;
      const next = freshSteps[this.currentStepIndex];
      this.bumpAndNotifyAll();
      this.draftSaveDebouncer?.();
      this.callbacks.onStepChange?.(this.currentStepIndex, next.id);
      return true;
    } finally {
      if (this.formValidationEpoch === myEpoch) {
        this.isAdvancingStep = false;
      }
    }
  }

  public previousStep(): void {
    if (this.currentStepIndex <= 0) return;
    const steps = this.getVisibleSteps();
    let candidateIdx = this.currentStepIndex - 1;
    while (candidateIdx >= 0 && this.isStepSkipped(steps[candidateIdx])) {
      candidateIdx -= 1;
    }
    if (candidateIdx < 0) return;
    this.currentStepIndex = candidateIdx;
    const prev = steps[this.currentStepIndex];
    this.bumpAndNotifyAll();
    this.draftSaveDebouncer?.();
    if (prev) {
      this.callbacks.onStepChange?.(this.currentStepIndex, prev.id);
    }
  }

  public async goToStep(stepIndex: number): Promise<boolean> {
    const steps = this.getVisibleSteps();
    if (stepIndex < 0 || stepIndex >= steps.length) return false;
    this.currentStepIndex = stepIndex;
    this.bumpAndNotifyAll();
    this.callbacks.onStepChange?.(stepIndex, steps[stepIndex].id);
    return true;
  }

  // ===========================================================================
  // Submission & Reset
  // ===========================================================================

  private handleInvalidFocusAndScroll(firstField: string, message?: string): void {
    if (message) this.announceError(message);

    // If invalid field belongs to an earlier/later step, jump to that step automatically
    const steps = this.getVisibleSteps();
    if (steps.length > 0) {
      const ownerStepIdx = steps.findIndex((s) =>
        s.fields.some((f) => f.name === firstField || firstField.startsWith(`${f.name}.`))
      );
      if (ownerStepIdx >= 0 && ownerStepIdx !== this.currentStepIndex) {
        this.currentStepIndex = ownerStepIdx;
        this.bumpAndNotifyAll();
      }
    }

    const shouldFocus = this.config.validation?.focusFirstError !== false;
    const focusHandle = shouldFocus ? this.focusHandles.get(firstField) : undefined;

    if (this.config.validation?.scrollToFirstError !== false) {
      this.onScrollToField?.(firstField, { willFocusField: Boolean(focusHandle) });
    }
    if (focusHandle) {
      focusHandle.focus();
    }
  }

  public async submit(): Promise<boolean> {
    const preventDup = this.config.submit?.preventDuplicateSubmit ?? true;
    if (
      this.externalLoading ||
      (preventDup && (this.isSubmitting || this.submitStatus === 'loading'))
    ) {
      return false;
    }

    this.isSubmitting = true;
    const mySubmitEpoch = ++this.submitEpoch;
    this.submitStatus = 'loading';

    try {
      if (this.config.keyboard?.dismissOnSubmit !== false) {
        Keyboard?.dismiss?.();
      }

      this.submitCount += 1;

      // Mark all active fields as touched so error visibility rules display all errors
      for (const d of collectActiveFields(this.config, this.values)) {
        if (d.parentVisible) {
          this.touchedFields[d.path] = true;
        }
      }

      this.bumpAndNotifyAll();

      let submitValues = this.getValues();

      if (this.config.validation?.validateOnSubmit !== false) {
        let verifiedSnapshot: FormValues | null = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const preValidateVersions = { ...this.fieldValueVersion };
          const result = await this.validate(undefined, 'onSubmit');
          if (this.submitEpoch !== mySubmitEpoch) {
            return false;
          }
          if (!result.valid) {
            this.submitStatus = 'failure';
            this.bumpAndNotifyAll();
            if (result.firstErrorField) {
              this.handleInvalidFocusAndScroll(
                result.firstErrorField,
                result.errors[result.firstErrorField]
              );
            }
            this.callbacks.onInvalid?.(result.errors, result, this.getValues());
            return false;
          }

          const postMutated = Object.keys(this.fieldValueVersion).some(
            (p) => (this.fieldValueVersion[p] ?? 0) !== (preValidateVersions[p] ?? 0)
          );
          if (!postMutated) {
            verifiedSnapshot = this.getValues();
            break;
          }
        }

        if (!verifiedSnapshot) {
          this.submitStatus = 'failure';
          this.bumpAndNotifyAll();
          return false;
        }
        submitValues = verifiedSnapshot;
      }

      const helpers: FormSubmitHelpers = {
        reset: (nextVals) => this.reset(nextVals),
        setError: (field, msg) => this.setError(field, msg),
        setErrors: (errs, fErrs) => this.setServerErrors(errs, fErrs),
        setServerErrors: (errs, fErrs) => this.setServerErrors(errs, fErrs),
        setValue: (field, val) => this.setValue(field, val),
      };

      // Invoke registered JSON action if specified
      const submitActionId = this.config.submit?.actionId;
      if (submitActionId && this.actions) {
        const ref = this.config.actions?.[submitActionId];
        const handlerId = typeof ref === 'string' ? ref : (ref?.handlerId ?? submitActionId);
        const params = typeof ref === 'object' ? ref.params : undefined;
        const handler = this.actions[handlerId];
        if (handler) {
          await handler({
            actionId: submitActionId,
            values: submitValues,
            params,
            setValue: helpers.setValue,
            setError: helpers.setError,
          });
          if (this.submitEpoch !== mySubmitEpoch) {
            return false;
          }
        }
      }

      await this.callbacks.onSubmit?.(submitValues, helpers);
      if (this.submitEpoch !== mySubmitEpoch) {
        return false;
      }

      if (Object.keys(this.errors).length > 0 || this.formErrors.length > 0) {
        this.submitStatus = 'failure';
        this.bumpAndNotifyAll();
        return false;
      }

      if (this.config.draft?.clearOnSubmit !== false) {
        await this.clearDraft();
      }

      this.submitStatus = 'success';
      this.bumpAndNotifyAll();
      return true;
    } catch (err) {
      if (this.submitEpoch !== mySubmitEpoch) {
        return false;
      }
      this.submitStatus = 'failure';
      const msg = err instanceof Error ? err.message : 'Form submission failed';
      this.formErrors = [msg];
      this.announceError(msg);
      this.bumpAndNotifyAll();
      return false;
    } finally {
      if (this.submitEpoch === mySubmitEpoch) {
        this.isSubmitting = false;
      }
    }
  }

  public reset(nextInitialValues?: FormValues): void {
    this.fieldValidateDebouncers.forEach((d) => d.cancel());
    this.validationEngine.abortAsyncValidation();
    this.formValidationEpoch += 1;
    this.submitEpoch += 1;
    this.isSubmitting = false;
    this.isAdvancingStep = false;

    let base = nextInitialValues
      ? buildInitialFormValues(this.config, nextInitialValues)
      : deepClone(this.initialValues);

    if (this.config.security?.clearSensitiveOnReset !== false && !nextInitialValues) {
      for (const sPath of this.sensitivePaths) {
        base = setByPath(base, sPath, '');
      }
    }

    this.values = base;
    if (nextInitialValues) {
      this.initialValues = deepClone(base);
    }

    this.errors = {};
    this.formErrors = [];
    this.dirtyFields = {};
    this.touchedFields = {};
    this.validatingFields = {};
    this.fieldValidationSeq = {};
    this.filesByField = {};
    this.focusedField = null;
    this.submitCount = 0;
    this.submitStatus = 'idle';
    this.currentStepIndex = 0;

    for (const p of this.allFieldsMap.keys()) {
      this.externalValueVersion[p] = (this.externalValueVersion[p] ?? 0) + 1;
      this.fieldValueVersion[p] = (this.fieldValueVersion[p] ?? 0) + 1;
    }
    for (const k of Object.keys(base)) {
      this.externalValueVersion[k] = (this.externalValueVersion[k] ?? 0) + 1;
      this.fieldValueVersion[k] = (this.fieldValueVersion[k] ?? 0) + 1;
    }

    this.recomputeAllComputedFields(false);
    this.bumpAndNotifyAll();
    this.callbacks.onReset?.(this.getValues());
  }
}
