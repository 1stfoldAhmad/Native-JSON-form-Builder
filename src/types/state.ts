import type { Ref } from 'react';

import type { FormConfig } from './config';
import type { FieldConfig, FormFileAsset } from './fields';
import type {
  ActionHandler,
  AsyncFieldValidator,
  DataSourceProvider,
  DraftStorageAdapter,
  FieldComponent,
  IconRenderOverride,
} from './registry';
import type { ValidationResult } from './validation';

/**
 * Host wrapping mode for `<ExpoForm />` (Section 6).
 * - `'auto'`: Reuses an ancestor `<ExpoFormProvider>` / managed ExpoForm `<Host>` when present,
 *   and creates a `<Host>` automatically when standalone or inside an ordinary React Native View.
 * - `'inherit'`: Assumes caller already mounted an external `@expo/ui` `<Host>` directly above.
 * - `'always'`: Always creates a new `@expo/ui` `<Host>` (wrapped in `RNHostView` if already inside a managed Host).
 */
export type HostMode = 'auto' | 'inherit' | 'always';

/**
 * Submission lifecycle status (Section 14).
 */
export type FormSubmitStatus = 'idle' | 'loading' | 'success' | 'failure';

export type FormValues = Record<string, unknown>;

export interface FieldRuntimeState {
  value: unknown;
  initialValue: unknown;
  dirty: boolean;
  touched: boolean;
  focused: boolean;
  validating: boolean;
  visible: boolean;
  enabled: boolean;
  required: boolean;
  error?: string;
  files?: FormFileAsset[];
}

export interface FormStateSnapshot {
  values: FormValues;
  initialValues: FormValues;
  errors: Record<string, string>;
  formErrors: string[];
  dirtyFields: Record<string, boolean>;
  touchedFields: Record<string, boolean>;
  validatingFields: Record<string, boolean>;
  filesByField: Record<string, FormFileAsset[]>;
  focusedField: string | null;
  isDirty: boolean;
  isValid: boolean;
  submitCount: number;
  submitStatus: FormSubmitStatus;
  currentStepIndex: number;
}

export interface FormSubmitHelpers {
  reset: (nextValues?: FormValues) => void;
  setError: (field: string, message: string) => void;
  setErrors: (errors: Record<string, string>, formErrors?: string[]) => void;
  setServerErrors: (errors: Record<string, string>, formErrors?: string[]) => void;
  setValue: (field: string, value: unknown) => void;
}

/**
 * Imperative form handle exposed via `ref` (Section 9).
 */
export interface ExpoFormRef<TValues extends FormValues = FormValues> {
  /** Validate and submit the form programmatically. Returns true when submission succeeds. */
  submit: () => Promise<boolean>;
  /** Reset all fields to initial values (or new provided initial values), clearing sensitive fields when configured. */
  reset: (nextInitialValues?: Partial<TValues>) => void;
  /** Validate the entire form or a single field path. */
  validate: (fieldName?: string) => Promise<ValidationResult>;
  /** Return a shallow/deep clone of current form values. */
  getValues: () => TValues;
  /** Read a single field's current value. */
  getValue: (fieldName: string) => unknown;
  /** Programmatically update a field's value (synchronizes native `ObservableState` without flicker). */
  setValue: (
    fieldName: string,
    value: unknown,
    options?: { shouldValidate?: boolean; shouldDirty?: boolean; shouldTouch?: boolean }
  ) => void;
  /** Batch-update multiple field values. */
  setValues: (values: Partial<TValues>, options?: { shouldValidate?: boolean }) => void;
  /** Set a validation or server error on a specific field. */
  setError: (fieldName: string, message: string) => void;
  /** Map multiple backend/API field errors (and optional form-level banner errors) onto the form. */
  setServerErrors: (fieldErrors: Record<string, string>, formErrors?: string[]) => void;
  /** Clear a single field's error or all errors across the form. */
  clearErrors: (fieldName?: string) => void;
  /** Programmatically focus a field and scroll it into view if supported. */
  focus: (fieldName: string) => void;
  /** Blur the currently focused field. */
  blur: (fieldName?: string) => void;
  /** Inspect runtime state of a single field. */
  getFieldState: (fieldName: string) => FieldRuntimeState;
  /** Inspect full snapshot of form state. */
  getState: () => FormStateSnapshot;
  /** Multi-step navigation helpers. */
  nextStep: () => Promise<boolean>;
  previousStep: () => void;
  goToStep: (stepIndex: number) => Promise<boolean>;
  /** Clear any persisted draft in storage. */
  clearDraft: () => Promise<void>;
}

export interface ConfigSchemaIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Public props for `<ExpoForm />` (Sections 6, 9, 14).
 */
export interface ExpoFormProps<TValues extends FormValues = FormValues> {
  ref?: Ref<ExpoFormRef<TValues>>;

  /** Complete JSON configuration describing the form. */
  config: FormConfig;

  /** Automatic Host boundary mode ('auto' | 'inherit' | 'always'). Defaults to 'auto'. */
  hostMode?: HostMode;

  /** Initial/prefilled values (merged over `config.defaults` and field `defaultValue`). */
  initialValues?: Partial<TValues>;

  /** Disable all editable controls across the form. */
  disabled?: boolean;

  /** Render the entire form in non-editable read-only mode. */
  readOnly?: boolean;

  /** External loading state override preventing duplicate submissions. */
  loading?: boolean;

  /** External server/API validation errors mapped onto fields. */
  serverErrors?: Record<string, string>;

  /** External form-level error messages. */
  formErrors?: readonly string[];

  /** Active locale override (e.g. 'en', 'ur'). */
  locale?: string;

  /** Color scheme override ('light' | 'dark'). */
  colorScheme?: 'light' | 'dark';

  /** Called whenever any form value changes. */
  onChange?: (values: TValues, meta: { changedField: string; isDirty: boolean }) => void;

  /** Called when an individual field's value changes. */
  onFieldChange?: (fieldName: string, value: unknown, values: TValues) => void;

  /** Called on valid form submission. Supports async promises to drive loading/success/failure states automatically. */
  onSubmit?: (values: TValues, helpers: FormSubmitHelpers) => void | Promise<void>;

  /** Called when form submission fails validation. */
  onInvalid?: (errors: Record<string, string>, result: ValidationResult, values: TValues) => void;

  /** Called when a field receives focus. */
  onFocus?: (fieldName: string) => void;

  /** Called when a field loses focus. */
  onBlur?: (fieldName: string, value: unknown) => void;

  /** Called whenever validation executes. */
  onValidation?: (result: ValidationResult) => void;

  /** Called when files are selected or removed in an upload field. */
  onFilesSelected?: (fieldName: string, files: FormFileAsset[]) => void;

  /** Called when the form resets. */
  onReset?: (values: TValues) => void;

  /** Called when active step changes in a multi-step wizard form. */
  onStepChange?: (stepIndex: number, stepId: string) => void;

  /** Called if `config` contains structural or schema configuration errors. */
  onConfigError?: (issues: ConfigSchemaIssue[]) => void;

  /** Form-scoped data source providers (merged with ExpoFormProvider dataSources). */
  dataSources?: Record<string, DataSourceProvider>;

  /** Form-scoped async field validators (merged with ExpoFormProvider asyncValidators). */
  asyncValidators?: Record<string, AsyncFieldValidator>;

  /** Form-scoped action handlers (merged with ExpoFormProvider actions). */
  actions?: Record<string, ActionHandler>;

  /** Form-scoped custom field renderers (merged with FieldRegistry & ExpoFormProvider). */
  customFields?: Record<string, FieldComponent>;

  /** Custom icon renderer override. */
  renderIcon?: IconRenderOverride;

  /** Optional draft persistence storage adapter. */
  storageAdapter?: DraftStorageAdapter;

  /** Test identifier forwarded to root container. */
  testID?: string;
}

export type { FieldConfig };
