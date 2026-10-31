/**
 * Declarative condition expression used in `visibleWhen`, `hiddenWhen`,
 * `enabledWhen`, `requiredWhen`, and conditional validation rules.
 * Never embeds executable JavaScript functions in JSON.
 */
export interface ConditionClause {
  /** Target field path (supports dot notation for nested objects, e.g. 'account.type'). */
  field?: string;
  /** Exact equality against value. */
  equals?: unknown;
  /** Exact inequality against value. */
  notEquals?: unknown;
  /** String substring or array element membership check. */
  contains?: unknown;
  /** Negated substring or array element membership check. */
  notContains?: unknown;
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
  /** Additional static parameters passed to the registered validator. */
  params?: Record<string, unknown>;
  /** Custom fallback error message when validator rejects or returns false. */
  message?: string;
}

/**
 * Per-field Layer-2 validation configuration complementing JSON Schema.
 */
export interface FieldValidationConfig {
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
  /** Asynchronous server validator configuration. */
  async?: AsyncFieldValidationConfig;
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
