export type StandardConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'matches'
  | 'dateBefore'
  | 'dateAfter'
  | 'between'
  | 'equalsField'
  | 'notEqualsField'
  | (string & {});

export type ConditionGroupOperator = 'AND' | 'OR' | 'NOT' | 'and' | 'or' | 'not';

/**
 * Declarative condition expression used in `visibleWhen`, `hiddenWhen`,
 * `enabledWhen`, `disabledWhen`, `readOnlyWhen`, `requiredWhen`, and conditional validation rules.
 * Supports:
 * 1. Canonical operator groups: `{ operator: 'AND', conditions: [...] }`
 * 2. Canonical leaf clauses: `{ field: 'vehicleType', operator: 'equals', value: 'commercial' }`
 * 3. Reusable named condition references: `{ ref: 'isCommercialVehicle' }`
 * 4. Shorthand clauses (`equals`, `and`, `or`, `not`) and maps (`{ accountType: 'business' }`).
 * Never embeds executable JavaScript functions in JSON.
 */
export interface ConditionClause {
  /** Group combinator ('AND' | 'OR' | 'NOT') or leaf comparison operator ('equals', 'greaterThan', etc.). */
  operator?: ConditionGroupOperator | StandardConditionOperator;
  /** Child condition array when `operator` is 'AND', 'OR', or 'NOT'. */
  conditions?: readonly ConditionExpression[];
  /** Reference to a reusable named condition registered in `config.conditions` or `ConditionRegistry`. */
  ref?: string;

  /** Target field path (supports dot notation for nested objects, e.g. 'account.type'). */
  field?: string;
  /** Operand value when using `{ field, operator, value }` syntax. */
  value?: unknown;
  /** Sibling field path operand when comparing field-to-field (`{ field, operator, valueField }`). */
  valueField?: string;

  /** Exact equality against value. */
  equals?: unknown;
  /** Exact inequality against value. */
  notEquals?: unknown;
  /** String substring or array element membership check. */
  contains?: unknown;
  /** Negated substring or array element membership check. */
  notContains?: unknown;
  /** String prefix check. */
  startsWith?: string;
  /** String suffix check. */
  endsWith?: string;
  /** Value belongs to the given list. */
  in?: readonly unknown[];
  /** Value does not belong to the given list. */
  notIn?: readonly unknown[];
  /** Numeric or ISO-date strictly greater than comparison. */
  greaterThan?: number | string;
  /** Numeric or ISO-date greater than or equal comparison. */
  greaterThanOrEqual?: number | string;
  /** Numeric or ISO-date strictly less than comparison. */
  lessThan?: number | string;
  /** Numeric or ISO-date less than or equal comparison. */
  lessThanOrEqual?: number | string;
  /** Inclusive [min, max] range check for numbers or ISO dates. */
  between?: readonly [number | string, number | string];
  /** ISO date strictly before threshold. */
  dateBefore?: string;
  /** ISO date strictly after threshold. */
  dateAfter?: string;
  /** Regex pattern match on stringified value. */
  matches?: string | { pattern: string; flags?: string };
  /** True when the target field is empty (null, undefined, '', or []). */
  isEmpty?: boolean;
  /** True when the target field is non-empty. */
  isNotEmpty?: boolean;
  /** Compare target field directly against another field's current value. */
  equalsField?: string;
  /** Compare target field inequality against another field's current value. */
  notEqualsField?: string;

  /** Logical combinators for compound conditions. */
  and?: readonly ConditionExpression[];
  /** Logical OR combinator. */
  or?: readonly ConditionExpression[];
  /** Logical NOT combinator. */
  not?: ConditionExpression;
}

/**
 * Supports either a structured ConditionClause or a shorthand map `{ [fieldName]: expectedValue }`.
 */
export type ConditionExpression = ConditionClause | Record<string, unknown>;

/**
 * Custom regex rule with optional flags and field-specific validation message.
 */
export interface RegexRuleConfig {
  /** Regular expression pattern string or named preset ('email', 'pkPhone', 'intlPhone', 'cnic', 'username', 'url', 'postalCode'). */
  pattern: string;
  /** Optional RegExp flags (e.g. 'i', 'u'). */
  flags?: string;
  /** Custom error message shown when pattern fails. */
  message?: string;
  /** Optional rule identifier. */
  name?: string;
}

/**
 * Password strength validation configuration.
 */
export interface PasswordValidationConfig {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecialChar?: boolean;
  specialCharPattern?: string;
  disallowSpaces?: boolean;
  /** Minimum strength score (0-4) required to pass. */
  minStrengthScore?: number;
  messages?: {
    minLength?: string;
    maxLength?: string;
    uppercase?: string;
    lowercase?: string;
    number?: string;
    specialChar?: string;
    spaces?: string;
    strength?: string;
  };
}

/**
 * Phone number validation configuration (Pakistani, country-specific, or E.164 international).
 */
export interface PhoneValidationConfig {
  /** Preset mode: 'pk' (Pakistani), 'international' (E.164 / country-aware), or 'custom'. */
  mode?: 'pk' | 'international' | 'country' | 'custom' | (string & {});
  /** Default ISO 3166-1 alpha-2 country code (e.g. 'PK', 'US', 'GB', 'AE'). */
  defaultCountry?: string;
  /** Field path whose selected country code dynamically drives phone validation rules. */
  countryField?: string;
  /** Custom regex override. */
  pattern?: string;
  message?: string;
}

/**
 * Cross-field validation rule definition.
 */
export interface CrossFieldRuleConfig {
  /** Rule kind. */
  type:
    | 'equalsField'
    | 'notEqualsField'
    | 'afterField'
    | 'onOrAfterField'
    | 'beforeField'
    | 'onOrBeforeField'
    | 'greaterThanField'
    | 'greaterThanOrEqualField'
    | 'lessThanField'
    | 'lessThanOrEqualField'
    | 'minAge'
    | 'maxAge'
    | 'atLeastOne'
    | 'atLeastOneOf'
    | 'conditionalRequired'
    | (string & {});
  /** Other field name to compare against (for field-comparison rules). */
  targetField?: string;
  /** Group of field names (for multi-field rules like `atLeastOneOf`). */
  fields?: readonly string[];
  /** Numeric threshold (e.g. minimum age in years, minimum selected items). */
  value?: number;
  /** Condition expression for conditionalRequired. */
  when?: ConditionExpression;
  /** Custom validation error message. */
  message?: string;
}

export interface AsyncValidationRetryConfig {
  /** Maximum attempts including initial attempt (e.g. 2 = 1 retry). Defaults to 1. */
  maxAttempts?: number;
  /** Base delay in ms between retry attempts. Defaults to 250. */
  backoffMs?: number;
}

/**
 * Asynchronous server/provider validation reference.
 * References a validator registered in ExpoFormProvider or ExpoForm props — never raw JS in JSON.
 */
export interface AsyncFieldValidationConfig {
  /** Registered async validator identifier (e.g. 'checkEmailAvailable', 'verifyUsername'). */
  validatorId: string;
  /** Debounce delay in milliseconds before invoking async validator. Defaults to 400. */
  debounceMs?: number;
  /** Trigger timing: 'onBlur' | 'onChange' | 'onSubmit'. Defaults to 'onBlur'. */
  trigger?: 'onBlur' | 'onChange' | 'onSubmit' | (string & {});
  /** Sibling field paths whose values invalidate cached results and re-trigger validation. */
  dependsOn?: readonly string[];
  /** Cache TTL in milliseconds for `(validatorId, field, value, dependsOn)` results. Defaults to 0 (disabled) unless specified. */
  cacheTtlMs?: number;
  /** Optional retry policy for transient network failures. */
  retry?: AsyncValidationRetryConfig;
  /** Optional condition gating whether this async rule executes. */
  when?: ConditionExpression;
  /** Additional static parameters passed to the registered validator. */
  params?: Record<string, unknown>;
  /** Custom fallback error message when validator rejects or returns false. */
  message?: string;
}

export interface CustomValidationRuleRef {
  /** Registered synchronous validator ID. */
  validatorId: string;
  params?: Record<string, unknown>;
  message?: string;
  when?: ConditionExpression;
}

/**
 * Per-field Layer-2 validation configuration complementing JSON Schema.
 */
export interface FieldValidationConfig {
  /** Optional condition gating whether non-required validation rules on this field execute. */
  when?: ConditionExpression;
  required?: boolean | string;
  requiredWhen?: ConditionExpression;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  /** Standard pattern string or custom RegexRuleConfig (or list of regex rules). */
  regex?: string | RegexRuleConfig | readonly RegexRuleConfig[];
  /** Named format or preset ('email', 'url', 'pkPhone', 'intlPhone', 'emailOrPhone', 'cnic', 'postalCode', 'date', 'time', 'date-time'). */
  format?: string;
  /** Equals another field (shorthand for confirmPassword -> 'password'). */
  equalsField?: string;
  /** Must differ from another field. */
  notEqualsField?: string;
  /** Numeric greater-than comparison against another field. */
  greaterThanField?: string;
  /** Numeric less-than comparison against another field. */
  lessThanField?: string;
  /** Must not precede another date field (e.g. startDate). */
  notBeforeField?: string;
  /** Must not follow another date field (e.g. endDate). */
  notAfterField?: string;
  /** Minimum age in years (for birthday / date of birth fields). */
  minAge?: number;
  /** Maximum age in years. */
  maxAge?: number;
  /** Password strength rules. */
  password?: PasswordValidationConfig;
  /** Phone validation rules. */
  phone?: PhoneValidationConfig;
  /** Postal code country or field dependency. */
  postalCodeCountry?: string;
  postalCodeCountryField?: string;
  /** CNIC validation (supports dashed XXXXX-XXXXXXX-X or 13-digit format). */
  cnic?: boolean | { allowUnformatted?: boolean; pattern?: string; message?: string };
  /** Explicit cross-field rules. */
  crossField?: readonly CrossFieldRuleConfig[];
  /** Registered custom synchronous validation rules. */
  custom?: CustomValidationRuleRef | readonly CustomValidationRuleRef[];
  /** Asynchronous server validator configuration (single rule or array of rules). */
  async?: AsyncFieldValidationConfig | readonly AsyncFieldValidationConfig[];
  /** Custom per-rule error messages keyed by JSON Schema keyword or rule name (e.g. required, pattern, format, minLength, minimum, equalsField, minAge). */
  messages?: Record<string, string>;
}

/**
 * JSON Schema 2020-12 object definition.
 */
export interface JsonSchemaDefinition {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | readonly string[];
  properties?: Record<string, JsonSchemaDefinition>;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchemaDefinition;
  items?: JsonSchemaDefinition | readonly JsonSchemaDefinition[];
  prefixItems?: readonly JsonSchemaDefinition[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: readonly unknown[];
  const?: unknown;
  default?: unknown;
  allOf?: readonly JsonSchemaDefinition[];
  anyOf?: readonly JsonSchemaDefinition[];
  oneOf?: readonly JsonSchemaDefinition[];
  not?: JsonSchemaDefinition;
  if?: JsonSchemaDefinition;
  then?: JsonSchemaDefinition;
  else?: JsonSchemaDefinition;
  dependentRequired?: Record<string, readonly string[]>;
  dependentSchemas?: Record<string, JsonSchemaDefinition>;
  $defs?: Record<string, JsonSchemaDefinition>;
  /** Custom AJV keyword extensions supported by ExpoForm's ValidationEngine. */
  equalsField?: string;
  notBeforeField?: string;
  minAge?: number;
  errorMessage?: string | Record<string, string>;
  [keyword: string]: unknown;
}

/**
 * Form-level validation timing and UX configuration.
 */
export type ValidationMode =
  | 'onBlur'
  | 'onChange'
  | 'onSubmit'
  | 'immediate'
  | (string & {});

export interface FormValidationBehaviorConfig {
  /** Primary validation mode. Defaults to 'onBlur'. */
  mode?: ValidationMode;
  /** Validate fields while their value changes. */
  validateOnChange?: boolean;
  /** Validate fields when they lose focus. */
  validateOnBlur?: boolean;
  /** Validate entire form on submit. Defaults to true. */
  validateOnSubmit?: boolean;
  /** Only display field errors once the field has been touched (or form submitted). Defaults to true. */
  showErrorsAfterTouch?: boolean;
  /** Suppress validation until the user attempts the first submission. */
  onlyAfterFirstSubmit?: boolean;
  /** Debounce interval (ms) for onChange validation. Defaults to 0 (immediate) or configurable e.g. 250. */
  debounceMs?: number;
  /** Automatically clear a field's error as soon as its value becomes valid (or changes). Defaults to true. */
  clearErrorsOnChange?: boolean;
  /** Automatically scroll to the first invalid field on failed submit. Defaults to true. */
  scrollToFirstError?: boolean;
  /** Automatically focus the first invalid field on failed submit. Defaults to true. */
  focusFirstError?: boolean;
  /** Form-level cross-field rules evaluated across the whole value object. */
  rules?: readonly (CrossFieldRuleConfig & { field?: string })[];
  /** Alias for `rules` for cross-field rule arrays. */
  crossFieldRules?: readonly (CrossFieldRuleConfig & { field?: string })[];
  /** Custom localized validation message templates. */
  messages?: Record<string, string>;
}

export interface FieldValidationError {
  field: string;
  message: string;
  rule: string;
  source: 'schema' | 'field' | 'crossField' | 'async' | 'server' | 'upload';
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  errorDetails: Record<string, FieldValidationError[]>;
  formErrors: string[];
  firstErrorField?: string;
}
