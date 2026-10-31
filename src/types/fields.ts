import type { AnimationItemConfig } from './animations';
import type { FieldStyleOverride } from './styles';
import type { ConditionExpression, FieldValidationConfig } from './validation';

/**
 * Category A — Text and personal information (20 field types)
 */
export type TextPersonalFieldType =
  | 'text'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'fullName'
  | 'username'
  | 'email'
  | 'phone'
  | 'emailOrPhone'
  | 'password'
  | 'confirmPassword'
  | 'pin'
  | 'otp'
  | 'textarea'
  | 'search'
  | 'masked'
  | 'organization'
  | 'jobTitle'
  | 'website'
  | 'url';

/**
 * Category B — Numeric and financial fields (11 field types)
 */
export type NumericFieldType =
  | 'number'
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'percentage'
  | 'age'
  | 'quantity'
  | 'price'
  | 'phoneExtension'
  | 'slider'
  | 'rangeSlider';

/**
 * Category C — Selection and choice fields (14 field types)
 */
export type SelectionFieldType =
  | 'checkbox'
  | 'checkboxGroup'
  | 'switch'
  | 'radioGroup'
  | 'select'
  | 'searchableSelect'
  | 'multiSelect'
  | 'searchableMultiSelect'
  | 'autocomplete'
  | 'chips'
  | 'tagInput'
  | 'segmentedControl'
  | 'rating'
  | 'colorPicker';

/**
 * Category D — Date and time fields (9 field types)
 */
export type DateTimeFieldType =
  | 'date'
  | 'time'
  | 'dateTime'
  | 'dateRange'
  | 'birthday'
  | 'month'
  | 'year'
  | 'duration'
  | 'timezone';

/**
 * Category E — Address and location fields (9 field types)
 */
export type AddressLocationFieldType =
  | 'address'
  | 'addressLine1'
  | 'addressLine2'
  | 'country'
  | 'state'
  | 'city'
  | 'postalCode'
  | 'coordinates'
  | 'locationSearch';

/**
 * Category F — File and media upload fields (11 field types)
 */
export type FileUploadFieldType =
  | 'image'
  | 'camera'
  | 'avatar'
  | 'video'
  | 'audio'
  | 'document'
  | 'pdf'
  | 'file'
  | 'multipleFiles'
  | 'multipleImages'
  | 'signature';

/**
 * Category G — Structural and advanced fields (14 field types)
 */
export type StructuralFieldType =
  | 'heading'
  | 'description'
  | 'staticText'
  | 'divider'
  | 'section'
  | 'fieldGroup'
  | 'hidden'
  | 'readOnly'
  | 'computed'
  | 'repeater'
  | 'objectGroup'
  | 'arrayGroup'
  | 'conditionalGroup'
  | 'stepGroup';

/**
 * Union of all 88 built-in field types across Categories A–G.
 */
export type BuiltInFieldType =
  | TextPersonalFieldType
  | NumericFieldType
  | SelectionFieldType
  | DateTimeFieldType
  | AddressLocationFieldType
  | FileUploadFieldType
  | StructuralFieldType;

/**
 * Extensible field type supporting all 88 built-in types plus developer-registered custom types.
 */
export type FieldType = BuiltInFieldType | (string & {});

/**
 * Choice/dropdown option item.
 */
export interface FieldOption {
  label: string;
  value: string | number | boolean;
  description?: string;
  icon?: string;
  flag?: string;
  group?: string;
  disabled?: boolean;
  meta?: Record<string, unknown>;
}

export interface DataSourceOptionMapping {
  labelKey: string;
  valueKey: string;
  descriptionKey?: string;
  disabledKey?: string;
  groupKey?: string;
}

/**
 * Remote, REST, static, or registered data-source binding for dynamic/dependent dropdowns,
 * searchable selects, autocomplete, and location search.
 */
export interface FieldDataSourceConfig {
  /** Registered data source identifier in ExpoFormProvider / ExpoForm props (or inline REST source ID). */
  id: string;
  /** Data source transport kind. Defaults to 'provider' unless `url` is specified. */
  type?: 'provider' | 'rest' | 'static';
  /** Declarative REST endpoint template supporting `{{depField}}`, `{{query}}`, `{{page}}`, `{{pageSize}}`. */
  url?: string;
  /** HTTP method when `type: 'rest'` or `url` is specified. Defaults to 'GET'. */
  method?: 'GET' | 'POST';
  /** Static non-secret HTTP headers for REST requests. */
  headers?: Record<string, string>;
  /** Registered auth header/token provider ID so credentials are never embedded in JSON. */
  authProviderId?: string;
  /** Dot-path into the JSON response body locating the array of items (e.g. 'data.items'). */
  responsePath?: string;
  /** Dot-path into the JSON response body locating `hasMore` boolean (e.g. 'meta.hasMore'). */
  hasMorePath?: string;
  /** Declarative mapping from raw REST item objects to `FieldOption`. */
  mapOption?: DataSourceOptionMapping;
  /** Cache TTL in milliseconds (defaults to 60_000 for REST/provider when caching is enabled; 0 disables cache). */
  cacheTtlMs?: number;
  /** Static option items when `type: 'static'`. */
  options?: readonly (FieldOption | string)[];
  /** Other field paths whose current values are forwarded as query parameters (e.g. ['country', 'state']). */
  dependsOn?: readonly string[];
  /** Clear field value automatically whenever a depended-on field changes. Defaults to true. */
  resetOnDependencyChange?: boolean;
  /** Debounce delay (ms) for search queries. Defaults to 300. */
  debounceMs?: number;
  /** Page size for incremental/paginated loading. */
  pageSize?: number;
  /** Static parameters passed to the data source provider. */
  params?: Record<string, unknown>;
  /** Empty state text when no results match. */
  emptyMessage?: string;
  /** Loading state text. */
  loadingMessage?: string;
}

/**
 * Role-based UX & client validation permission policy.
 * Note: Client-side visibility/editability rules are NEVER authorization; sensitive access
 * restrictions must always be enforced server-side as well.
 */
export interface PermissionRuleConfig {
  /** Roles allowed to view this element. Omit to allow all roles. */
  visibleForRoles?: readonly string[];
  /** Roles hidden from viewing this element. */
  hiddenForRoles?: readonly string[];
  /** Roles allowed to edit/interact with this element. Non-matching roles render read-only. */
  editableForRoles?: readonly string[];
  /** Roles explicitly forced into read-only mode. */
  readOnlyForRoles?: readonly string[];
  /** Roles for whom this field becomes required. */
  requiredForRoles?: readonly string[];
  /** Roles allowed to invoke a workflow/step action. */
  allowedRoles?: readonly string[];
}

export interface BarcodeScanConfig {
  /** Allowed symbologies (e.g. ['qr', 'ean13', 'ean8', 'code128', 'pdf417']). */
  formats?: readonly string[];
  /** Reject duplicate scanned codes within the same session/repeater. */
  preventDuplicates?: boolean;
  /** Optional regex/prefix extractor or field mapping key. */
  extractPattern?: string;
}

/**
 * Password visibility toggle and strength indicator configuration (Section 4).
 */
export interface PasswordVisibilityToggleConfig {
  /** Enable visibility toggle button. Defaults to true when object is provided. */
  enabled?: boolean;
  /** Logical icon name shown while password is hidden (e.g. 'eye'). */
  showIcon?: string;
  /** Logical icon name shown while password is visible (e.g. 'eye-off'). */
  hideIcon?: string;
  /** Accessible label when hidden. */
  showLabel?: string;
  /** Accessible label when revealed. */
  hideLabel?: string;
}

/**
 * Numeric & financial formatting options (Category B).
 */
export interface NumericFormatConfig {
  precision?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  currencyCode?: string;
  currencySymbol?: string;
  thousandSeparator?: boolean | string;
  decimalSeparator?: string;
  locale?: string;
  clampOnBlur?: boolean;
}

/**
 * File & media upload configuration (Category F).
 */
export interface FileUploadConfig {
  /** Allowed MIME types (e.g. ['image/jpeg', 'image/png', 'application/pdf']). */
  allowedMimeTypes?: readonly string[];
  /** Allowed file extensions (e.g. ['.jpg', '.png', '.pdf']). */
  allowedExtensions?: readonly string[];
  /** Maximum single-file size in bytes. */
  maxFileSize?: number;
  /** Minimum single-file size in bytes. */
  minFileSize?: number;
  /** Maximum number of selected files. */
  maxFiles?: number;
  /** Allow selecting multiple files. */
  multiple?: boolean;
  /** Permitted selection sources. */
  sources?: readonly ('camera' | 'gallery' | 'files' | (string & {}))[];
  /** Image compression quality (0.0 - 1.0) passed to expo-image-picker. */
  imageQuality?: number;
  /** Allow native editing/cropping in image picker. */
  allowsEditing?: boolean;
  /** Aspect ratio [width, height] when editing images. */
  aspect?: readonly [number, number];
  /** Registered upload handler action ID for background upload with progress & retry. */
  uploadActionId?: string;
  /** Button label override. */
  buttonLabel?: string;
  /** Camera button label override. */
  cameraButtonLabel?: string;
}

/**
 * Selected file asset metadata managed in form state.
 */
export interface FormFileAsset {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  extension?: string;
  width?: number;
  height?: number;
  duration?: number;
  source?: 'camera' | 'gallery' | 'files' | 'signature';
  status?: 'selected' | 'uploading' | 'uploaded' | 'error';
  progress?: number;
  errorMessage?: string;
  remoteUrl?: string;
}

/**
 * Declarative computed field formula — never uses `eval` or executable JS strings.
 */
export interface ComputedFieldFormula {
  /** Operation type. */
  operation:
    | 'template'
    | 'sum'
    | 'subtract'
    | 'multiply'
    | 'divide'
    | 'concat'
    | 'ageFromDate'
    | 'count'
    | 'conditional'
    | (string & {});
  /** Source field paths used by the calculation. */
  fields?: readonly string[];
  /** String template with `{{fieldName}}` placeholders (for operation: 'template'). */
  template?: string;
  /** Separator string (for operation: 'concat'). */
  separator?: string;
  /** Decimal rounding precision for numeric operations. */
  precision?: number;
  /** Conditional value branches (for operation: 'conditional'). */
  when?: ConditionExpression;
  thenValue?: unknown;
  elseValue?: unknown;
  /** Registered pure formatter/calculator ID if custom business calculation is needed. */
  calculatorId?: string;
}

/**
 * Multi-step wizard step definition (used inside `stepGroup` or top-level `steps`).
 */
export interface FormStepConfig {
  id: string;
  title: string | Record<string, string>;
  description?: string | Record<string, string>;
  icon?: string;
  /** Fields rendered in this step. */
  fields: readonly FieldConfig[];
  /** Validate step fields before advancing to next step. Defaults to true. */
  validateBeforeNext?: boolean;
  visibleWhen?: ConditionExpression;
  /** Conditionally skip this step during forward/backward wizard navigation while keeping it defined. */
  skipWhen?: ConditionExpression;
  /** Step-level role permissions. */
  permissions?: PermissionRuleConfig;
  nextLabel?: string | Record<string, string>;
  previousLabel?: string | Record<string, string>;
}

/**
 * Accessibility metadata per field (Section 12).
 */
export interface FieldAccessibilityConfig {
  label?: string;
  hint?: string;
  role?: string;
  announceErrors?: boolean;
  announceRequired?: boolean;
  liveRegion?: 'none' | 'polite' | 'assertive' | (string & {});
}

/**
 * Complete single-field JSON configuration contract.
 */
export interface FieldConfig {
  /** Field key/path in form values (optional only for purely visual structural elements like `divider` or `heading`). */
  name?: string;
  /** Unique element ID override (defaults to `name`). */
  id?: string;
  /** Field category/type from the 88 built-in types or a custom registered type. */
  type: FieldType;

  /** Display label (supports localized string or locale map `{ en: '...', ur: '...' }`). */
  label?: string | Record<string, string>;
  /** Placeholder text. */
  placeholder?: string | Record<string, string>;
  /** Supporting description below label or field. */
  description?: string | Record<string, string>;
  /** Helper text shown beneath the control. */
  helperText?: string | Record<string, string>;
  /** Static text content (for `heading`, `description`, `staticText`). */
  content?: string | Record<string, string>;
  /** Heading level (1-4) for `heading` fields. */
  level?: 1 | 2 | 3 | 4 | number;

  /** Initial/default value for this field. */
  defaultValue?: unknown;

  /** Shorthand required flag. */
  required?: boolean;
  /** Disable interaction. */
  disabled?: boolean;
  /** Display value without editing. */
  readOnly?: boolean;
  /** Visually hide field. */
  hidden?: boolean;
  /** Mark field as sensitive (never logged, never persisted to drafts, cleared on reset if configured). */
  sensitive?: boolean;

  /** Input behavior hints. */
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' | (string & {});
  autoCorrect?: boolean;
  autoComplete?: string;
  keyboardType?: string;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send' | 'default' | (string & {});
  /** Target field name to focus when user presses Next/Return, or `'submit'` to submit form. */
  nextField?: string;
  maxLength?: number;
  minLength?: number;
  numberOfLines?: number;
  selectTextOnFocus?: boolean;

  /** Prefix / suffix text or icons. */
  prefix?: string;
  suffix?: string;
  leadingIcon?: string;
  trailingIcon?: string;

  /** Input mask pattern (e.g. '#####-#######-#' for CNIC, '+92 ### #######' for phone, '#### #### #### ####' for card). */
  mask?: string;
  /** Store raw unmasked characters in form state while displaying masked string. Defaults to false. */
  unmaskValue?: boolean;

  /** Password-specific configuration (Section 4). */
  visibilityToggle?: boolean | PasswordVisibilityToggleConfig;
  /** Reference original password field name for `confirmPassword` (defaults to `'password'`). */
  passwordField?: string;
  /** Display live password strength meter under password field. */
  showStrengthIndicator?: boolean;

  /** Phone & country configuration. */
  defaultCountry?: string;
  allowedCountries?: readonly string[];
  countryField?: string;
  showCountryPicker?: boolean;

  /** Numeric & slider configuration. */
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  currency?: string;
  currencySymbol?: string;
  format?: NumericFormatConfig;
  showStepper?: boolean;

  /** Selection, searchable dropdown, chips, tags & rating configuration. */
  options?: readonly (FieldOption | string)[];
  dataSource?: string | FieldDataSourceConfig;
  pickerAppearance?: 'menu' | 'wheel' | (string & {});
  searchable?: boolean;
  searchPlaceholder?: string;
  clearable?: boolean;
  selectAll?: boolean;
  maxSelections?: number;
  minSelections?: number;
  groupBy?: boolean;
  highlightMatches?: boolean;
  maxRating?: number;
  allowHalfRating?: boolean;
  colorPresets?: readonly string[];
  supportsOpacity?: boolean;

  /** Date & time configuration. */
  minDate?: string;
  maxDate?: string;
  is24Hour?: boolean;
  dateDisplay?: 'default' | 'spinner' | 'compact' | 'inline' | 'calendar' | 'clock' | (string & {});
  datePresentation?: 'inline' | 'dialog' | (string & {});
  timezone?: string;
  locale?: string;

  /** File & media upload configuration. */
  upload?: FileUploadConfig;

  /** Structural, nested, repeater, section, conditional & wizard children. */
  fields?: readonly FieldConfig[];
  steps?: readonly FormStepConfig[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
  minItems?: number;
  maxItems?: number;
  addButtonLabel?: string;
  removeButtonLabel?: string;
  itemLabelTemplate?: string;
  computed?: ComputedFieldFormula;
  /** Restricted formula expression (e.g. `"baseFee + (baseFee * taxRate / 100)"` or `"SUM(items.*.amount)"`). Never uses `eval`. */
  formula?: string;
  /** Restricted formula expression computing the initial default value when no explicit value is provided. */
  defaultFormula?: string;
  /** Optional registered input/display formatter ID. */
  formatterId?: string;
  /** Optional QR / barcode scan configuration. */
  scan?: BarcodeScanConfig;
  /** Role-based UX & client validation permissions (server must still enforce authorization). */
  permissions?: PermissionRuleConfig;

  /** Layout hints within a grid/row. */
  width?: number | `${number}%` | (string & {});
  columns?: number;
  row?: string;

  /** Declarative conditions (Section 10). */
  visibleWhen?: ConditionExpression;
  hiddenWhen?: ConditionExpression;
  enabledWhen?: ConditionExpression;
  disabledWhen?: ConditionExpression;
  readOnlyWhen?: ConditionExpression;
  requiredWhen?: ConditionExpression;

  /** Per-field validation (Layer 2). */
  validation?: FieldValidationConfig;

  /** Per-field style overrides. */
  style?: FieldStyleOverride;

  /** Per-field animation toggle or overrides. */
  animations?: boolean | Partial<Record<'enter' | 'exit' | 'reveal' | 'focus' | 'error', AnimationItemConfig>>;

  /** Accessibility overrides. */
  accessibility?: FieldAccessibilityConfig;

  /** Arbitrary custom metadata forwarded to custom registered field renderers. */
  props?: Record<string, unknown>;
  testID?: string;
}
