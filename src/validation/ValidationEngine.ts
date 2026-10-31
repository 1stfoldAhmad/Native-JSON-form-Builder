import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { evaluateCondition, isFieldRequired, isFieldVisible } from '../conditions/evaluator';
import type {
  AsyncFieldValidator,
  CrossFieldRuleConfig,
  FieldConfig,
  FieldValidationError,
  FormConfig,
  FormValues,
  JsonSchemaDefinition,
  RegexRuleConfig,
  ValidationResult,
} from '../types';
import { deepEqual, getByPath, isEmptyValue } from '../utils/deepPath';
import { calculateAgeInYears, resolveLocalizedText } from '../utils/formatting';
import {
  inspectSchemaRegexPatterns,
  MAX_REGEX_INPUT_LENGTH,
  safeRegexTest,
} from '../utils/regexSafety';
import { AsyncValidationManager } from './AsyncValidationManager';
import { evaluatePasswordStrength } from './passwordStrength';
import {
  isValidCNIC,
  isValidEmail,
  isValidEmailOrPhone,
  isValidPhone,
  isValidPostalCode,
  resolveNamedPattern,
  VALIDATION_PATTERNS,
} from './patterns';

/**
 * Declarative client-side & shared JSON Schema / rule validation engine.
 *
 * Security boundary note:
 * Client-side validation, conditional visibility (`visibleWhen` / `hiddenWhen`),
 * read-only flags, and `permissions` role gates exist for responsive native UX —
 * they are NEVER a substitute for server-side authorization or payload validation.
 * Backends receiving form submissions MUST independently authenticate callers,
 * enforce field-level RBAC/ABAC permissions, strip unauthorized fields, and
 * re-validate submitted payloads (for example by running `ValidationEngine` or
 * JSON Schema validation in a trusted Node/Edge runtime).
 */
export interface FlattenedFieldDescriptor {
  path: string;
  field: FieldConfig;
  parentVisible: boolean;
}

/**
 * Recursively collects all data-bearing fields from `fields`, `sections`, `steps`,
 * `objectGroup`, `conditionalGroup`, `fieldGroup`, and `stepGroup`, evaluating
 * parent container visibility against `values`.
 */
export function collectActiveFields(
  config: FormConfig,
  values: FormValues
): FlattenedFieldDescriptor[] {
  const result: FlattenedFieldDescriptor[] = [];
  const fieldByName = new Map<string, FieldConfig>();
  for (const f of config.fields ?? []) {
    if (f.name) fieldByName.set(f.name, f);
  }

  const namedConditions = config.conditions;

  const extractRowScope = (path: string) => {
    const segs = path.split('.');
    for (let i = segs.length - 2; i >= 0; i -= 1) {
      if (/^\d+$/.test(segs[i])) {
        return {
          rowPrefix: segs.slice(0, i + 1).join('.'),
          rowIndex: Number(segs[i]),
        };
      }
    }
    return {};
  };

  const walk = (fields: readonly FieldConfig[], prefix: string, parentVisible: boolean) => {
    for (const field of fields) {
      const currentPath = field.name ? (prefix ? `${prefix}.${field.name}` : field.name) : prefix;
      const condCtx = { namedConditions, ...extractRowScope(currentPath) };
      const ownVisible = parentVisible && isFieldVisible(field, values, condCtx);

      if (field.type === 'stepGroup' && field.steps?.length) {
        for (const step of field.steps) {
          const stepVisible =
            ownVisible &&
            (!step.visibleWhen || evaluateCondition(step.visibleWhen, values, condCtx));
          walk(step.fields, prefix, stepVisible);
        }
        continue;
      }

      if (
        (field.type === 'section' ||
          field.type === 'fieldGroup' ||
          field.type === 'conditionalGroup') &&
        field.fields?.length
      ) {
        walk(field.fields, prefix, ownVisible);
        continue;
      }

      if (field.type === 'objectGroup' && field.name && field.fields?.length) {
        result.push({ path: currentPath, field, parentVisible: ownVisible });
        walk(field.fields, currentPath, ownVisible);
        continue;
      }

      if (field.type === 'repeater' && field.name && field.fields?.length) {
        result.push({ path: currentPath, field, parentVisible: ownVisible });
        const items = getByPath(values, currentPath);
        if (Array.isArray(items)) {
          items.forEach((_, idx) => {
            walk(field.fields ?? [], `${currentPath}.${idx}`, ownVisible);
          });
        }
        continue;
      }

      if (field.name) {
        result.push({ path: currentPath, field, parentVisible: ownVisible });
      }
    }
  };

  if (config.steps?.length) {
    for (const step of config.steps) {
      const stepVisible =
        !step.visibleWhen ||
        evaluateCondition(step.visibleWhen, values, { namedConditions });
      walk(step.fields, '', stepVisible);
    }
  } else if (config.sections?.length) {
    const referencedNames = new Set<string>();
    for (const section of config.sections) {
      const sectionVisible =
        (!section.visibleWhen ||
          evaluateCondition(section.visibleWhen, values, { namedConditions })) &&
        (!section.hiddenWhen ||
          !evaluateCondition(section.hiddenWhen, values, { namedConditions }));

      const resolvedFields: FieldConfig[] = [];
      for (const entry of section.fields) {
        if (typeof entry === 'string') {
          referencedNames.add(entry);
          const found = fieldByName.get(entry);
          if (found) resolvedFields.push(found);
        } else {
          if (entry.name) referencedNames.add(entry.name);
          resolvedFields.push(entry);
        }
      }
      walk(resolvedFields, '', sectionVisible);
    }
    // Include any top-level fields not claimed by a section
    const unclaimed = (config.fields ?? []).filter((f) => !f.name || !referencedNames.has(f.name));
    if (unclaimed.length > 0) {
      walk(unclaimed, '', true);
    }
  } else if (config.fields?.length) {
    walk(config.fields, '', true);
  }

  return result;
}

export function normalizeEmbeddedJsonSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const normalizedSchema: Record<string, unknown> = { ...schema };
  if (
    typeof normalizedSchema.$schema === 'string' &&
    !normalizedSchema.$schema.includes('2020-12')
  ) {
    delete normalizedSchema.$schema;
  }
  return normalizedSchema;
}

export function createFormSchemaAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: true,
    $data: true,
    validateFormats: true,
  });

  addFormats(ajv);

  // Register custom formats used in Native JSON Form Builder
  ajv.addFormat('pkPhone', {
    type: 'string',
    validate: (val: string) => val === '' || isValidPhone(val, { mode: 'pk' }),
  });
  ajv.addFormat('intlPhone', {
    type: 'string',
    validate: (val: string) => val === '' || isValidPhone(val, { mode: 'international' }),
  });
  ajv.addFormat('emailOrPhone', {
    type: 'string',
    validate: (val: string) => val === '' || isValidEmailOrPhone(val),
  });
  ajv.addFormat('cnic', {
    type: 'string',
    validate: (val: string) => val === '' || isValidCNIC(val),
  });
  ajv.addFormat('postalCode', {
    type: 'string',
    validate: (val: string) => val === '' || isValidPostalCode(val),
  });

  // Register custom cross-field keywords directly on AJV 2020-12
  ajv.addKeyword({
    keyword: 'equalsField',
    type: ['string', 'number', 'boolean'],
    schemaType: 'string',
    validate(targetField: string, data: unknown, _parentSchema?: unknown, dataCxt?: { rootData: unknown }) {
      const rootData = (dataCxt?.rootData ?? {}) as FormValues;
      return deepEqual(data, getByPath(rootData, targetField));
    },
    error: {
      message: 'Must match the referenced field',
    },
  });

  ajv.addKeyword({
    keyword: 'notBeforeField',
    type: 'string',
    schemaType: 'string',
    validate(startField: string, data: string, _parentSchema?: unknown, dataCxt?: { rootData: unknown }) {
      if (!data) return true;
      const rootData = (dataCxt?.rootData ?? {}) as FormValues;
      const startVal = getByPath(rootData, startField);
      if (!startVal || typeof startVal !== 'string') return true;
      const endTs = Date.parse(data);
      const startTs = Date.parse(startVal);
      if (Number.isNaN(endTs) || Number.isNaN(startTs)) return true;
      return endTs >= startTs;
    },
    error: {
      message: 'End date must not precede start date',
    },
  });

  ajv.addKeyword({
    keyword: 'minAge',
    type: 'string',
    schemaType: 'number',
    validate(minYears: number, data: string) {
      if (!data) return true;
      const age = calculateAgeInYears(data);
      return age !== null && age >= minYears;
    },
    error: {
      message: 'Does not meet the minimum age requirement',
    },
  });

  ajv.addKeyword({
    keyword: 'errorMessage',
    schemaType: ['string', 'object'],
  });

  return ajv;
}

function pointerToDotPath(instancePath: string, missingProperty?: string): string {
  const base = instancePath
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '.'))
    .join('.');
  if (missingProperty) {
    return base ? `${base}.${missingProperty}` : missingProperty;
  }
  return base;
}

function formatAjvErrorMessage(
  err: ErrorObject,
  fieldLabel: string,
  fieldConfig?: FieldConfig,
  schemaProp?: JsonSchemaDefinition,
  formMessages?: Record<string, string>
): string {
  const keyword = err.keyword;
  // 1. Per-field validation.messages override
  const fieldOverride = fieldConfig?.validation?.messages?.[keyword];
  if (fieldOverride) return fieldOverride;

  // 2. JSON Schema property `errorMessage`
  if (schemaProp?.errorMessage) {
    if (typeof schemaProp.errorMessage === 'string') return schemaProp.errorMessage;
    if (typeof schemaProp.errorMessage === 'object' && schemaProp.errorMessage[keyword]) {
      return schemaProp.errorMessage[keyword];
    }
  }

  // 3. Form-level message template
  if (formMessages?.[keyword]) {
    return formMessages[keyword].replace(/\{label\}/g, fieldLabel);
  }

  switch (keyword) {
    case 'required':
      if (typeof fieldConfig?.validation?.required === 'string') {
        return fieldConfig.validation.required;
      }
      return `${fieldLabel} is required`;
    case 'minLength':
      return `${fieldLabel} must be at least ${(err.params as { limit?: number }).limit} characters`;
    case 'maxLength':
      return `${fieldLabel} must be at most ${(err.params as { limit?: number }).limit} characters`;
    case 'minimum':
      return `${fieldLabel} must be at least ${(err.params as { limit?: number }).limit}`;
    case 'maximum':
      return `${fieldLabel} must be at most ${(err.params as { limit?: number }).limit}`;
    case 'minItems':
      return `Please select at least ${(err.params as { limit?: number }).limit} option(s) for ${fieldLabel}`;
    case 'maxItems':
      return `Please select at most ${(err.params as { limit?: number }).limit} option(s) for ${fieldLabel}`;
    case 'format': {
      const fmt = (err.params as { format?: string }).format;
      if (fmt === 'email') return `Please enter a valid email address`;
      if (fmt === 'uri' || fmt === 'url') return `Please enter a valid URL`;
      return `${fieldLabel} is not in a valid ${fmt ?? ''} format`.trim();
    }
    case 'pattern':
      return `${fieldLabel} format is invalid`;
    case 'enum':
    case 'const':
      return `Please choose a valid value for ${fieldLabel}`;
    case 'equalsField':
      return `${fieldLabel} does not match`;
    case 'notBeforeField':
      return `${fieldLabel} cannot precede start date`;
    case 'minAge':
      return `Minimum age requirement not met for ${fieldLabel}`;
    default:
      return err.message ? `${fieldLabel} ${err.message}` : `${fieldLabel} is invalid`;
  }
}

export class ValidationEngine {
  private ajv: Ajv2020;
  private compiledSchema: ValidateFunction | null = null;
  private config: FormConfig;
  private schemaCompileError: string | null = null;
  private schemaRequiredSet: Set<string>;
  private asyncManager: AsyncValidationManager;

  constructor(config: FormConfig, asyncManager?: AsyncValidationManager) {
    this.config = config;
    this.ajv = createFormSchemaAjv();
    this.schemaRequiredSet = new Set(config.schema?.required ?? []);
    this.asyncManager = asyncManager ?? new AsyncValidationManager();
    this.compileSchema(config.schema);
  }

  public getAsyncManager(): AsyncValidationManager {
    return this.asyncManager;
  }

  public invalidateAsyncCache(fieldPath?: string): void {
    if (!fieldPath) {
      this.asyncManager.clearCache();
    } else {
      this.asyncManager.invalidateField(fieldPath);
    }
  }

  public updateConfig(config: FormConfig): void {
    const idChanged = config.id !== this.config.id;
    const schemaChanged = config.schema !== this.config.schema;
    if (idChanged) {
      this.abortAsyncValidation();
      this.asyncManager.clearCache();
    }
    this.config = config;
    this.schemaRequiredSet = new Set(config.schema?.required ?? []);
    if (schemaChanged) {
      this.compileSchema(config.schema);
    }
  }

  /**
   * Aborts in-flight asynchronous validator request(s).
   * If `fieldPath` is provided, aborts that field (and any nested child paths);
   * otherwise aborts all active async validations across the form.
   */
  public abortAsyncValidation(fieldPath?: string): void {
    this.asyncManager.abort(fieldPath);
  }

  public getSchemaCompileError(): string | null {
    return this.schemaCompileError;
  }

  public getSchemaRequiredSet(): ReadonlySet<string> {
    return this.schemaRequiredSet;
  }

  private compileSchema(schema?: JsonSchemaDefinition): void {
    this.compiledSchema = null;
    this.schemaCompileError = null;
    if (!schema) return;

    const unsafePatterns = inspectSchemaRegexPatterns(schema, 'config.schema');
    if (unsafePatterns.length > 0) {
      this.schemaCompileError = unsafePatterns
        .map((p) => `${p.path}: ${p.reason}`)
        .join('; ');
      return;
    }

    try {
      const normalizedSchema = normalizeEmbeddedJsonSchema(
        schema as Record<string, unknown>
      );
      const isMetaValid = this.ajv.validateSchema(normalizedSchema);
      if (isMetaValid === false) {
        this.schemaCompileError = this.ajv.errorsText(this.ajv.errors, {
          dataVar: 'schema',
        });
        return;
      }
      this.compiledSchema = this.ajv.compile(normalizedSchema);
    } catch (err) {
      this.schemaCompileError =
        err instanceof Error ? err.message : 'Invalid JSON Schema configuration';
    }
  }

  /**
   * Synchronous Layer 1 (JSON Schema 2020-12) + Layer 2 (field & cross-field) validation.
   */
  public validateSync(
    values: FormValues,
    options?: {
      onlyFields?: readonly string[];
      locale?: string;
    }
  ): ValidationResult {
    const locale = options?.locale ?? this.config.i18n?.locale ?? 'en';
    const translations = this.config.i18n?.translations;
    const onlySet = options?.onlyFields ? new Set(options.onlyFields) : null;

    const descriptors = collectActiveFields(this.config, values);
    const descriptorByPath = new Map<string, FlattenedFieldDescriptor>();
    const visiblePaths = new Set<string>();
    const orderedPaths: string[] = [];

    for (const d of descriptors) {
      descriptorByPath.set(d.path, d);
      orderedPaths.push(d.path);
      if (d.parentVisible) {
        visiblePaths.add(d.path);
      }
    }

    const errorDetails: Record<string, FieldValidationError[]> = {};
    const formErrors: string[] = [];

    const pushError = (err: FieldValidationError) => {
      if (onlySet && !onlySet.has(err.field)) return;
      if (!errorDetails[err.field]) {
        errorDetails[err.field] = [];
      }
      // Avoid duplicate messages on the same field
      if (!errorDetails[err.field].some((e) => e.message === err.message)) {
        errorDetails[err.field].push(err);
      }
    };

    if (this.schemaCompileError) {
      formErrors.push(`Schema configuration error: ${this.schemaCompileError}`);
    }

    // =========================================================================
    // Layer 1: AJV JSON Schema 2020-12 validation
    // =========================================================================
    if (this.compiledSchema) {
      // Remove empty optional strings before AJV format/pattern check unless required,
      // matching HTML/React Native form semantics where empty optional email is allowed.
      const sanitizedValues = this.prepareValuesForSchema(values, descriptors);
      const valid = this.compiledSchema(sanitizedValues);
      if (!valid && this.compiledSchema.errors) {
        for (const ajvErr of this.compiledSchema.errors) {
          const missingProp =
            ajvErr.keyword === 'required'
              ? (ajvErr.params as { missingProperty?: string }).missingProperty
              : undefined;
          const fieldPath = pointerToDotPath(ajvErr.instancePath, missingProp);

          if (!fieldPath) {
            if (!onlySet && ajvErr.message) {
              formErrors.push(ajvErr.message);
            }
            continue;
          }

          // Skip errors on conditionally hidden fields
          const desc = descriptorByPath.get(fieldPath);
          if (desc && !desc.parentVisible) {
            continue;
          }

          // Skip format/pattern/minLength on empty non-required strings
          const fieldVal = getByPath(values, fieldPath);
          const isReq = desc
            ? isFieldRequired(desc.field, values, this.schemaRequiredSet, fieldPath)
            : this.schemaRequiredSet.has(fieldPath);
          if (!isReq && isEmptyValue(fieldVal) && ajvErr.keyword !== 'required') {
            continue;
          }

          const label =
            resolveLocalizedText(desc?.field.label, locale, translations) ?? fieldPath;
          const schemaProp = this.getSchemaProperty(fieldPath);
          const msg = formatAjvErrorMessage(
            ajvErr,
            label,
            desc?.field,
            schemaProp,
            this.config.validation?.messages
          );

          pushError({
            field: fieldPath,
            message: msg,
            rule: ajvErr.keyword,
            source: 'schema',
          });
        }
      }
    }

    // =========================================================================
    // Layer 2: Field-specific, Regex, Built-in Type, and Cross-Field validation
    // =========================================================================
    for (const desc of descriptors) {
      if (!desc.parentVisible) continue;
      if (onlySet && !onlySet.has(desc.path)) continue;

      const { path, field } = desc;
      const val = getByPath(values, path);
      const label = resolveLocalizedText(field.label, locale, translations) ?? path;
      const fv = field.validation;

      const rowSegs = path.split('.');
      let rowPrefix: string | undefined;
      let rowIndex: number | undefined;
      for (let i = rowSegs.length - 2; i >= 0; i -= 1) {
        if (/^\d+$/.test(rowSegs[i])) {
          rowPrefix = rowSegs.slice(0, i + 1).join('.');
          rowIndex = Number(rowSegs[i]);
          break;
        }
      }
      const condCtx = {
        namedConditions: this.config.conditions,
        rowPrefix,
        rowIndex,
      };

      // Conditional validation gate (`validation.when`)
      if (fv?.when && !evaluateCondition(fv.when, values, condCtx)) {
        continue;
      }

      const required = isFieldRequired(
        field,
        values,
        this.schemaRequiredSet,
        path,
        condCtx
      );
      const empty =
        isEmptyValue(val) ||
        (field.type === 'checkbox' && required && val !== true);

      if (required && empty) {
        const reqMessage =
          typeof fv?.required === 'string'
            ? fv.required
            : fv?.messages?.required ??
              (field.type === 'checkbox'
                ? `You must accept ${label}`
                : `${label} is required`);
        pushError({
          field: path,
          message: reqMessage,
          rule: 'required',
          source: 'field',
        });
        continue;
      }

      if (isEmptyValue(val)) {
        // Still evaluate explicit conditional cross-field rules when empty
        if (fv?.crossField) {
          this.evaluateCrossFieldRules(path, label, val, values, fv.crossField, pushError);
        }
        continue;
      }

      // String length constraints
      if (typeof val === 'string') {
        const minLen = fv?.minLength ?? field.minLength;
        const maxLen = fv?.maxLength ?? field.maxLength;
        if (minLen !== undefined && val.length < minLen) {
          pushError({
            field: path,
            message:
              fv?.messages?.minLength ?? `${label} must be at least ${minLen} characters`,
            rule: 'minLength',
            source: 'field',
          });
        }
        if (maxLen !== undefined && val.length > maxLen) {
          pushError({
            field: path,
            message:
              fv?.messages?.maxLength ?? `${label} must be at most ${maxLen} characters`,
            rule: 'maxLength',
            source: 'field',
          });
        }
      }

      // Numeric min/max & integer constraints
      if (typeof val === 'number' && !Number.isNaN(val)) {
        const min = fv?.min ?? field.min;
        const max = fv?.max ?? field.max;
        if (field.type === 'integer' && !Number.isInteger(val)) {
          pushError({
            field: path,
            message: fv?.messages?.integer ?? `${label} must be a whole number`,
            rule: 'integer',
            source: 'field',
          });
        }
        if (min !== undefined && val < min) {
          pushError({
            field: path,
            message: fv?.messages?.min ?? fv?.messages?.minimum ?? `${label} must be at least ${min}`,
            rule: 'min',
            source: 'field',
          });
        }
        if (max !== undefined && val > max) {
          pushError({
            field: path,
            message: fv?.messages?.max ?? fv?.messages?.maximum ?? `${label} must be at most ${max}`,
            rule: 'max',
            source: 'field',
          });
        }
      }

      // Range slider [min, max] validation
      if (field.type === 'rangeSlider' && Array.isArray(val) && val.length === 2) {
        const [low, high] = val as [number, number];
        if (low > high) {
          pushError({
            field: path,
            message: fv?.messages?.range ?? `${label} minimum cannot exceed maximum`,
            rule: 'range',
            source: 'field',
          });
        }
      }

      // Array / checkboxGroup / multiSelect item counts
      if (Array.isArray(val)) {
        const minItems = fv?.minItems ?? field.minSelections ?? field.minItems;
        const maxItems = fv?.maxItems ?? field.maxSelections ?? field.maxItems;
        if (minItems !== undefined && val.length < minItems) {
          pushError({
            field: path,
            message:
              fv?.messages?.minItems ??
              `Please select at least ${minItems} item(s) for ${label}`,
            rule: 'minItems',
            source: 'field',
          });
        }
        if (maxItems !== undefined && val.length > maxItems) {
          pushError({
            field: path,
            message:
              fv?.messages?.maxItems ??
              `Please select at most ${maxItems} item(s) for ${label}`,
            rule: 'maxItems',
            source: 'field',
          });
        }
      }

      // Built-in field type & format validations
      if (typeof val === 'string') {
        const format = fv?.format;

        if ((field.type === 'email' || format === 'email') && !isValidEmail(val)) {
          pushError({
            field: path,
            message: fv?.messages?.format ?? fv?.messages?.email ?? 'Please enter a valid email address',
            rule: 'email',
            source: 'field',
          });
        }

        if (field.type === 'phone' || format === 'pkPhone' || format === 'intlPhone' || fv?.phone) {
          const dynamicCountryField = fv?.phone?.countryField ?? field.countryField;
          const countryFromField = dynamicCountryField
            ? String(getByPath(values, dynamicCountryField) ?? '')
            : '';
          const countryCode =
            countryFromField || fv?.phone?.defaultCountry || field.defaultCountry;
          const mode =
            fv?.phone?.mode ??
            (format === 'pkPhone' ? 'pk' : format === 'intlPhone' ? 'international' : undefined);

          if (
            !isValidPhone(val, {
              mode,
              countryCode,
              customPattern: fv?.phone?.pattern,
            })
          ) {
            pushError({
              field: path,
              message:
                fv?.phone?.message ??
                fv?.messages?.phone ??
                'Please enter a valid phone number',
              rule: 'phone',
              source: 'field',
            });
          }
        }

        if (field.type === 'emailOrPhone' || format === 'emailOrPhone') {
          const countryCode = field.countryField
            ? String(getByPath(values, field.countryField) ?? '')
            : field.defaultCountry;
          if (!isValidEmailOrPhone(val, countryCode)) {
            pushError({
              field: path,
              message:
                fv?.messages?.emailOrPhone ??
                'Please enter a valid email address or phone number',
              rule: 'emailOrPhone',
              source: 'field',
            });
          }
        }

        if (
          (field.type === 'url' || field.type === 'website' || format === 'url') &&
          (val.length > MAX_REGEX_INPUT_LENGTH || !VALIDATION_PATTERNS.url.test(val.trim()))
        ) {
          pushError({
            field: path,
            message: fv?.messages?.url ?? 'Please enter a valid website URL',
            rule: 'url',
            source: 'field',
          });
        }

        if (
          field.type === 'username' &&
          !fv?.regex &&
          !this.getSchemaProperty(path)?.pattern &&
          (val.length > MAX_REGEX_INPUT_LENGTH || !VALIDATION_PATTERNS.username.test(val))
        ) {
          pushError({
            field: path,
            message:
              fv?.messages?.username ??
              'Username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens',
            rule: 'username',
            source: 'field',
          });
        }

        if (fv?.cnic || format === 'cnic') {
          const cnicCfg = typeof fv?.cnic === 'object' ? fv.cnic : undefined;
          let validCnic = false;
          let invalidPatternError = false;
          if (cnicCfg?.pattern) {
            const cnicTest = safeRegexTest(cnicCfg.pattern, val);
            validCnic = !cnicTest.blocked && cnicTest.matched;
            invalidPatternError = cnicTest.blocked && val.length <= MAX_REGEX_INPUT_LENGTH;
          } else {
            validCnic = isValidCNIC(val, cnicCfg?.allowUnformatted ?? true);
          }
          if (!validCnic) {
            pushError({
              field: path,
              message:
                cnicCfg?.message ??
                fv?.messages?.cnic ??
                (invalidPatternError
                  ? 'Invalid CNIC validation pattern configuration'
                  : 'Please enter a valid CNIC (e.g. 35202-1234567-1)'),
              rule: 'cnic',
              source: 'field',
            });
          }
        }

        if (field.type === 'postalCode' || format === 'postalCode') {
          const cField = fv?.postalCodeCountryField ?? field.countryField;
          const country =
            (cField ? String(getByPath(values, cField) ?? '') : '') ||
            fv?.postalCodeCountry ||
            field.defaultCountry;
          if (!isValidPostalCode(val, country)) {
            pushError({
              field: path,
              message: fv?.messages?.postalCode ?? 'Please enter a valid postal/ZIP code',
              rule: 'postalCode',
              source: 'field',
            });
          }
        }

        // Password strength rules
        if (fv?.password) {
          const strength = evaluatePasswordStrength(val, fv.password);
          for (const pwdErr of strength.errors) {
            pushError({
              field: path,
              message: pwdErr,
              rule: 'password',
              source: 'field',
            });
          }
        }

        // Custom regex rules (single string, single RegexRuleConfig, or array)
        if (fv?.regex) {
          const regexRules: RegexRuleConfig[] = Array.isArray(fv.regex)
            ? [...fv.regex]
            : typeof fv.regex === 'string'
              ? [{ pattern: fv.regex, message: fv.messages?.pattern }]
              : [fv.regex as RegexRuleConfig];

          for (const rule of regexRules) {
            if (val.length > MAX_REGEX_INPUT_LENGTH) {
              pushError({
                field: path,
                message:
                  rule.message ??
                  fv.messages?.pattern ??
                  `${label} exceeds maximum length of ${MAX_REGEX_INPUT_LENGTH} characters`,
                rule: rule.name ?? 'regex',
                source: 'field',
              });
              continue;
            }
            const re = resolveNamedPattern(rule.pattern, rule.flags);
            if (!re) {
              pushError({
                field: path,
                message:
                  rule.message ??
                  fv.messages?.pattern ??
                  `Unsafe or invalid validation pattern configured for ${label}`,
                rule: rule.name ?? 'regex',
                source: 'field',
              });
              continue;
            }
            if (!re.test(val)) {
              pushError({
                field: path,
                message: rule.message ?? fv.messages?.pattern ?? `${label} format is invalid`,
                rule: rule.name ?? 'regex',
                source: 'field',
              });
            }
          }
        }
      }

      // Confirm password & equalsField
      const targetEqualsField =
        fv?.equalsField ??
        (field.type === 'confirmPassword' ? (field.passwordField ?? 'password') : undefined);
      if (targetEqualsField) {
        const otherVal = getByPath(values, targetEqualsField);
        if (!deepEqual(val, otherVal)) {
          pushError({
            field: path,
            message:
              fv?.messages?.equalsField ??
              (field.type === 'confirmPassword'
                ? 'Passwords do not match'
                : `${label} must match ${targetEqualsField}`),
            rule: 'equalsField',
            source: 'crossField',
          });
        }
      }

  // Date range field (supports `{ startDate, endDate }` or `{ start, end }`)
      if (
        field.type === 'dateRange' &&
        val &&
        typeof val === 'object' &&
        !Array.isArray(val)
      ) {
        const rangeObj = val as {
          startDate?: string;
          endDate?: string;
          start?: string;
          end?: string;
        };
        const startStr = rangeObj.startDate ?? rangeObj.start;
        const endStr = rangeObj.endDate ?? rangeObj.end;
        if (startStr && endStr) {
          const s = Date.parse(startStr);
          const e = Date.parse(endStr);
          if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
            pushError({
              field: path,
              message: fv?.messages?.dateRange ?? 'End date must not precede start date',
              rule: 'dateRange',
              source: 'crossField',
            });
          }
        }
      }

      // Shorthand cross-field comparisons: notEqualsField / greaterThanField / lessThanField
      if (fv?.notEqualsField && !isEmptyValue(val)) {
        const otherVal = getByPath(values, fv.notEqualsField);
        if (deepEqual(val, otherVal)) {
          pushError({
            field: path,
            message:
              fv.messages?.notEqualsField ?? `${label} must differ from ${fv.notEqualsField}`,
            rule: 'notEqualsField',
            source: 'crossField',
          });
        }
      }

      if (fv?.greaterThanField && typeof val === 'number' && !Number.isNaN(val)) {
        const otherVal = Number(getByPath(values, fv.greaterThanField));
        if (!Number.isNaN(otherVal) && !(val > otherVal)) {
          pushError({
            field: path,
            message:
              fv.messages?.greaterThanField ??
              `${label} must be greater than ${fv.greaterThanField}`,
            rule: 'greaterThanField',
            source: 'crossField',
          });
        }
      }

      if (fv?.lessThanField && typeof val === 'number' && !Number.isNaN(val)) {
        const otherVal = Number(getByPath(values, fv.lessThanField));
        if (!Number.isNaN(otherVal) && !(val < otherVal)) {
          pushError({
            field: path,
            message:
              fv.messages?.lessThanField ??
              `${label} must be less than ${fv.lessThanField}`,
            rule: 'lessThanField',
            source: 'crossField',
          });
        }
      }

      // Date cross-field: notBeforeField / notAfterField
      if (fv?.notBeforeField && typeof val === 'string') {
        const startVal = getByPath(values, fv.notBeforeField);
        if (typeof startVal === 'string' && startVal) {
          const endTs = Date.parse(val);
          const startTs = Date.parse(startVal);
          if (!Number.isNaN(endTs) && !Number.isNaN(startTs) && endTs < startTs) {
            pushError({
              field: path,
              message:
                fv.messages?.notBeforeField ?? `${label} must not precede ${fv.notBeforeField}`,
              rule: 'notBeforeField',
              source: 'crossField',
            });
          }
        }
      }

      if (fv?.notAfterField && typeof val === 'string') {
        const endVal = getByPath(values, fv.notAfterField);
        if (typeof endVal === 'string' && endVal) {
          const curTs = Date.parse(val);
          const endTs = Date.parse(endVal);
          if (!Number.isNaN(curTs) && !Number.isNaN(endTs) && curTs > endTs) {
            pushError({
              field: path,
              message:
                fv.messages?.notAfterField ?? `${label} must not be after ${fv.notAfterField}`,
              rule: 'notAfterField',
              source: 'crossField',
            });
          }
        }
      }

      // Minimum / maximum age on date / birthday fields
      if ((fv?.minAge !== undefined || fv?.maxAge !== undefined) && typeof val === 'string') {
        const age = calculateAgeInYears(val);
        if (age !== null) {
          if (fv.minAge !== undefined && age < fv.minAge) {
            pushError({
              field: path,
              message:
                fv.messages?.minAge ?? `You must be at least ${fv.minAge} years old`,
              rule: 'minAge',
              source: 'field',
            });
          }
          if (fv.maxAge !== undefined && age > fv.maxAge) {
            pushError({
              field: path,
              message:
                fv.messages?.maxAge ?? `Age must not exceed ${fv.maxAge} years`,
              rule: 'maxAge',
              source: 'field',
            });
          }
        }
      }

      // Explicit per-field crossField rules
      if (fv?.crossField) {
        this.evaluateCrossFieldRules(path, label, val, values, fv.crossField, pushError);
      }
    }

    // Form-level cross-field rules (`rules` or `crossFieldRules`)
    const formRules = [
      ...(this.config.validation?.rules ?? []),
      ...(this.config.validation?.crossFieldRules ?? []),
    ];
    if (formRules.length > 0) {
      for (const rule of formRules) {
        const targetFieldPath = rule.field ?? rule.fields?.[0];
        if (!targetFieldPath) continue;
        const desc = descriptorByPath.get(targetFieldPath);
        if (desc && !desc.parentVisible) continue;
        if (onlySet && !onlySet.has(targetFieldPath)) continue;
        const val = getByPath(values, targetFieldPath);
        const label =
          resolveLocalizedText(desc?.field.label, locale, translations) ?? targetFieldPath;
        this.evaluateCrossFieldRules(targetFieldPath, label, val, values, [rule], pushError);
      }
    }

    return this.buildValidationResult(errorDetails, formErrors, orderedPaths, visiblePaths);
  }

  /**
   * Full validation including registered asynchronous server validators.
   */
  public async validateAsync(
    values: FormValues,
    asyncValidators: Record<string, AsyncFieldValidator> | undefined,
    options?: {
      onlyFields?: readonly string[];
      trigger?: 'onBlur' | 'onChange' | 'onSubmit';
      locale?: string;
      isFieldStale?: (fieldPath: string, validatedValue: unknown) => boolean;
    }
  ): Promise<ValidationResult> {
    const syncResult = this.validateSync(values, {
      onlyFields: options?.onlyFields,
      locale: options?.locale,
    });

    if (!asyncValidators || Object.keys(asyncValidators).length === 0) {
      return syncResult;
    }

    const locale = options?.locale ?? this.config.i18n?.locale ?? 'en';
    const descriptors = collectActiveFields(this.config, values);
    const onlySet = options?.onlyFields ? new Set(options.onlyFields) : null;
    const errorDetails: Record<string, FieldValidationError[]> = { ...syncResult.errorDetails };

    const asyncTasks: Promise<void>[] = [];

    for (const desc of descriptors) {
      if (!desc.parentVisible) continue;
      if (onlySet && !onlySet.has(desc.path)) continue;

      const asyncCfgRaw = desc.field.validation?.async;
      if (!asyncCfgRaw) continue;
      const asyncCfgList = Array.isArray(asyncCfgRaw) ? asyncCfgRaw : [asyncCfgRaw];

      // Skip async call if synchronous validation already failed on this field or value is empty
      if (errorDetails[desc.path]?.length) continue;
      const val = getByPath(values, desc.path);
      if (isEmptyValue(val)) continue;

      const condCtx = { namedConditions: this.config.conditions };
      if (
        desc.field.validation?.when &&
        !evaluateCondition(desc.field.validation.when, values, condCtx)
      ) {
        continue;
      }

      asyncTasks.push(
        this.asyncManager
          .evaluateFieldRules({
            fieldPath: desc.path,
            value: val,
            values,
            rules: asyncCfgList,
            validators: asyncValidators,
            locale,
            trigger: options?.trigger,
            conditionContext: condCtx,
            isFieldStale: options?.isFieldStale,
          })
          .then((fieldAsyncErrors) => {
            if (fieldAsyncErrors.length > 0) {
              errorDetails[desc.path] = [
                ...(errorDetails[desc.path] ?? []),
                ...fieldAsyncErrors,
              ];
            }
          })
      );
    }

    if (asyncTasks.length > 0) {
      await Promise.all(asyncTasks);
    }

    const orderedPaths = descriptors.map((d) => d.path);
    const visiblePaths = new Set(descriptors.filter((d) => d.parentVisible).map((d) => d.path));
    return this.buildValidationResult(
      errorDetails,
      syncResult.formErrors,
      orderedPaths,
      visiblePaths
    );
  }

  private evaluateCrossFieldRules(
    fieldPath: string,
    label: string,
    val: unknown,
    values: FormValues,
    rules: readonly CrossFieldRuleConfig[],
    pushError: (err: FieldValidationError) => void
  ): void {
    for (const rule of rules) {
      const otherVal = rule.targetField ? getByPath(values, rule.targetField) : undefined;

      switch (rule.type) {
        case 'equalsField':
          if (!isEmptyValue(val) && !deepEqual(val, otherVal)) {
            pushError({
              field: fieldPath,
              message: rule.message ?? `${label} must match ${rule.targetField}`,
              rule: 'equalsField',
              source: 'crossField',
            });
          }
          break;

        case 'notEqualsField':
          if (!isEmptyValue(val) && deepEqual(val, otherVal)) {
            pushError({
              field: fieldPath,
              message: rule.message ?? `${label} must differ from ${rule.targetField}`,
              rule: 'notEqualsField',
              source: 'crossField',
            });
          }
          break;

        case 'afterField':
        case 'onOrAfterField': {
          if (!isEmptyValue(val) && !isEmptyValue(otherVal)) {
            const a = Date.parse(String(val));
            const b = Date.parse(String(otherVal));
            if (!Number.isNaN(a) && !Number.isNaN(b)) {
              const ok = rule.type === 'afterField' ? a > b : a >= b;
              if (!ok) {
                pushError({
                  field: fieldPath,
                  message:
                    rule.message ?? `${label} must not precede ${rule.targetField}`,
                  rule: rule.type,
                  source: 'crossField',
                });
              }
            }
          }
          break;
        }

        case 'beforeField':
        case 'onOrBeforeField': {
          if (!isEmptyValue(val) && !isEmptyValue(otherVal)) {
            const a = Date.parse(String(val));
            const b = Date.parse(String(otherVal));
            if (!Number.isNaN(a) && !Number.isNaN(b)) {
              const ok = rule.type === 'beforeField' ? a < b : a <= b;
              if (!ok) {
                pushError({
                  field: fieldPath,
                  message:
                    rule.message ?? `${label} must precede ${rule.targetField}`,
                  rule: rule.type,
                  source: 'crossField',
                });
              }
            }
          }
          break;
        }

        case 'greaterThanField':
        case 'greaterThanOrEqualField': {
          if (!isEmptyValue(val) && !isEmptyValue(otherVal)) {
            const a = Number(val);
            const b = Number(otherVal);
            if (!Number.isNaN(a) && !Number.isNaN(b)) {
              const ok = rule.type === 'greaterThanField' ? a > b : a >= b;
              if (!ok) {
                pushError({
                  field: fieldPath,
                  message:
                    rule.message ?? `${label} must be greater than ${rule.targetField}`,
                  rule: rule.type,
                  source: 'crossField',
                });
              }
            }
          }
          break;
        }

        case 'lessThanField':
        case 'lessThanOrEqualField': {
          if (!isEmptyValue(val) && !isEmptyValue(otherVal)) {
            const a = Number(val);
            const b = Number(otherVal);
            if (!Number.isNaN(a) && !Number.isNaN(b)) {
              const ok = rule.type === 'lessThanField' ? a < b : a <= b;
              if (!ok) {
                pushError({
                  field: fieldPath,
                  message:
                    rule.message ?? `${label} must be less than ${rule.targetField}`,
                  rule: rule.type,
                  source: 'crossField',
                });
              }
            }
          }
          break;
        }

        case 'minAge': {
          if (!isEmptyValue(val) && rule.value !== undefined) {
            const age = calculateAgeInYears(String(val));
            if (age !== null && age < rule.value) {
              pushError({
                field: fieldPath,
                message: rule.message ?? `Minimum age is ${rule.value} years`,
                rule: 'minAge',
                source: 'crossField',
              });
            }
          }
          break;
        }

        case 'maxAge': {
          if (!isEmptyValue(val) && rule.value !== undefined) {
            const age = calculateAgeInYears(String(val));
            if (age !== null && age > rule.value) {
              pushError({
                field: fieldPath,
                message: rule.message ?? `Maximum age is ${rule.value} years`,
                rule: 'maxAge',
                source: 'crossField',
              });
            }
          }
          break;
        }

        case 'atLeastOne': {
          const minCount = rule.value ?? 1;
          const count = Array.isArray(val) ? val.length : val ? 1 : 0;
          if (count < minCount) {
            pushError({
              field: fieldPath,
              message:
                rule.message ?? `Please select at least ${minCount} option(s) for ${label}`,
              rule: 'atLeastOne',
              source: 'crossField',
            });
          }
          break;
        }

        case 'atLeastOneOf': {
          const groupFields = rule.fields ?? [fieldPath, ...(rule.targetField ? [rule.targetField] : [])];
          const anyPopulated = groupFields.some((p) => !isEmptyValue(getByPath(values, p)));
          if (!anyPopulated) {
            pushError({
              field: fieldPath,
              message:
                rule.message ??
                `Please provide at least one of: ${groupFields.join(', ')}`,
              rule: 'atLeastOneOf',
              source: 'crossField',
            });
          }
          break;
        }

        case 'conditionalRequired': {
          if (rule.when && evaluateCondition(rule.when, values) && isEmptyValue(val)) {
            pushError({
              field: fieldPath,
              message: rule.message ?? `${label} is required`,
              rule: 'conditionalRequired',
              source: 'crossField',
            });
          }
          break;
        }
      }
    }
  }

  private prepareValuesForSchema(
    values: FormValues,
    descriptors: readonly FlattenedFieldDescriptor[]
  ): FormValues {
    const copy: FormValues = { ...values };
    for (const d of descriptors) {
      if (!d.parentVisible && !d.path.includes('.')) {
        delete copy[d.path];
      } else if (
        !d.path.includes('.') &&
        copy[d.path] === '' &&
        !isFieldRequired(d.field, values, this.schemaRequiredSet, d.path)
      ) {
        delete copy[d.path];
      }
    }
    return copy;
  }

  private getSchemaProperty(fieldPath: string): JsonSchemaDefinition | undefined {
    const segments = fieldPath.split('.');
    let cursor = this.config.schema;
    for (const seg of segments) {
      if (!cursor?.properties) return undefined;
      cursor = cursor.properties[seg];
    }
    return cursor;
  }

  private buildValidationResult(
    errorDetails: Record<string, FieldValidationError[]>,
    formErrors: string[],
    orderedPaths: readonly string[],
    visiblePaths: ReadonlySet<string>
  ): ValidationResult {
    const errors: Record<string, string> = {};
    for (const [field, list] of Object.entries(errorDetails)) {
      if (list.length > 0) {
        errors[field] = list[0].message;
      }
    }

    let firstErrorField: string | undefined;
    for (const p of orderedPaths) {
      if (errors[p] && visiblePaths.has(p)) {
        firstErrorField = p;
        break;
      }
    }
    if (!firstErrorField) {
      firstErrorField = Object.keys(errors)[0];
    }

    const valid = Object.keys(errors).length === 0 && formErrors.length === 0;
    return {
      valid,
      errors,
      errorDetails,
      formErrors,
      firstErrorField,
    };
  }
}
