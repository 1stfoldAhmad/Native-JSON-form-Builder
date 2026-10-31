import {
  ALL_BUILT_IN_FIELD_TYPES,
  BUILT_IN_FIELD_TYPE_ALIASES,
} from '../fields/FieldRegistry';
import { parseFormula } from '../formula';
import type { ConfigSchemaIssue, FieldConfig, FormConfig } from '../types';
import { hasUnsafePathSegment } from '../utils/deepPath';
import {
  analyzeRegexSafety,
  inspectSchemaRegexPatterns,
} from '../utils/regexSafety';
import { isBuiltInSecretFieldType } from '../utils/security';
import { NAMED_VALIDATION_PRESETS } from '../validation/patterns';
import {
  createFormSchemaAjv,
  normalizeEmbeddedJsonSchema,
} from '../validation/ValidationEngine';

const STRUCTURAL_TYPES_WITHOUT_NAME = new Set([
  'heading',
  'description',
  'staticText',
  'divider',
  'section',
  'fieldGroup',
  'conditionalGroup',
  'stepGroup',
]);

const CHOICE_TYPES_EXPECTING_OPTIONS_OR_SOURCE = new Set([
  'checkboxGroup',
  'radioGroup',
  'select',
  'searchableSelect',
  'multiSelect',
  'searchableMultiSelect',
  'segmentedControl',
  'chips',
]);

const VALID_COMPUTED_OPERATIONS = new Set([
  'template',
  'sum',
  'subtract',
  'multiply',
  'divide',
  'concat',
  'ageFromDate',
  'count',
  'conditional',
  'custom',
]);

const BUILT_IN_TYPE_SET = new Set<string>([
  ...ALL_BUILT_IN_FIELD_TYPES,
  ...BUILT_IN_FIELD_TYPE_ALIASES,
]);

export interface ParseFormConfigOptions {
  /** Custom predicate checking if a field `type` is registered (built-in or custom). */
  isRegisteredFieldType?: (type: string) => boolean;
  /** Treat unknown/unregistered field types as fatal errors instead of warnings. Defaults to false. */
  strictFieldTypes?: boolean;
}

export interface ParsedFormConfigResult {
  config: FormConfig | null;
  issues: ConfigSchemaIssue[];
  errors: ConfigSchemaIssue[];
  warnings: ConfigSchemaIssue[];
  hasFatalError: boolean;
  valid: boolean;
}

function detectEmbeddedFunction(value: unknown, path: string, issues: ConfigSchemaIssue[]): void {
  if (typeof value === 'function') {
    issues.push({
      path,
      message:
        'Executable JavaScript functions are not allowed inside declarative form.json configs. Register handlers by string ID via <ExpoFormProvider /> or props.',
      severity: 'error',
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => detectEmbeddedFunction(item, `${path}[${index}]`, issues));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    detectEmbeddedFunction(v, `${path}.${k}`, issues);
  }
}

/**
 * Validates and normalizes an incoming JSON `FormConfig` (accepting either a parsed object
 * or a raw JSON string), reporting clear, developer-friendly standard-compliance diagnostics
 * rather than crashing silently.
 */
export function parseAndValidateFormConfig(
  rawInput: unknown,
  isRegisteredFieldTypeOrOptions?:
    | ((type: string) => boolean)
    | ParseFormConfigOptions
): ParsedFormConfigResult {
  const issues: ConfigSchemaIssue[] = [];

  const options: ParseFormConfigOptions =
    typeof isRegisteredFieldTypeOrOptions === 'function'
      ? { isRegisteredFieldType: isRegisteredFieldTypeOrOptions }
      : (isRegisteredFieldTypeOrOptions ?? {});

  const isTypeKnown =
    options.isRegisteredFieldType ?? ((type: string) => BUILT_IN_TYPE_SET.has(type));

  let rawConfig: unknown = rawInput;
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      issues.push({
        path: 'json',
        message: 'Form JSON string is empty. Provide a valid JSON object following the ExpoForm standard.',
        severity: 'error',
      });
      return finalizeResult(null, issues);
    }
    try {
      rawConfig = JSON.parse(trimmed);
    } catch (err) {
      issues.push({
        path: 'json',
        message: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Unable to parse JSON string'}`,
        severity: 'error',
      });
      return finalizeResult(null, issues);
    }
  }

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    issues.push({
      path: 'config',
      message: 'Form configuration must be a non-null JSON object.',
      severity: 'error',
    });
    return finalizeResult(null, issues);
  }

  // Enforce pure-JSON standard: reject embedded JS functions
  detectEmbeddedFunction(rawConfig, 'config', issues);

  const candidate = rawConfig as Partial<FormConfig>;

  if (!candidate.id || typeof candidate.id !== 'string' || candidate.id.trim() === '') {
    issues.push({
      path: 'config.id',
      message: 'Form configuration requires a non-empty string "id".',
      severity: 'error',
    });
  }

  const hasFields = Array.isArray(candidate.fields) && candidate.fields.length > 0;
  const hasSections = Array.isArray(candidate.sections) && candidate.sections.length > 0;
  const hasSteps = Array.isArray(candidate.steps) && candidate.steps.length > 0;

  if (!hasFields && !hasSections && !hasSteps) {
    issues.push({
      path: 'config.fields',
      message: 'Form configuration must define at least one of "fields", "sections", or "steps".',
      severity: 'error',
    });
  }

  // Validate embedded JSON Schema 2020-12 (including full meta-schema validation) if provided
  if (candidate.schema !== undefined) {
    if (!candidate.schema || typeof candidate.schema !== 'object' || Array.isArray(candidate.schema)) {
      issues.push({
        path: 'config.schema',
        message: '"schema" must be a valid JSON Schema 2020-12 object.',
        severity: 'error',
      });
    } else {
      const unsafeSchemaPatterns = inspectSchemaRegexPatterns(candidate.schema, 'config.schema');
      for (const unsafeItem of unsafeSchemaPatterns) {
        issues.push({
          path: unsafeItem.path,
          message: `Unsafe regular expression "${unsafeItem.pattern}" in schema: ${unsafeItem.reason}`,
          severity: 'error',
        });
      }
      if (unsafeSchemaPatterns.length === 0) {
        try {
          const ajv = createFormSchemaAjv();
          const normalizedSchema = normalizeEmbeddedJsonSchema(
            candidate.schema as Record<string, unknown>
          );
          const metaValid = ajv.validateSchema(normalizedSchema);
          if (metaValid === false) {
            issues.push({
              path: 'config.schema',
              message: `Invalid JSON Schema in "config.schema": ${ajv.errorsText(ajv.errors, { dataVar: 'schema' })}`,
              severity: 'error',
            });
          } else {
            ajv.compile(normalizedSchema);
          }
        } catch (err) {
          issues.push({
            path: 'config.schema',
            message: `Invalid JSON Schema in "config.schema": ${err instanceof Error ? err.message : 'compilation failed'}`,
            severity: 'error',
          });
        }
      }
    }
  }

  // Reject prototype-polluting keys in `defaults`
  if (candidate.defaults && typeof candidate.defaults === 'object' && !Array.isArray(candidate.defaults)) {
    for (const defaultKey of Object.keys(candidate.defaults)) {
      if (hasUnsafePathSegment(defaultKey)) {
        issues.push({
          path: `config.defaults.${defaultKey}`,
          message: `Unsafe reserved key "${defaultKey}" is not permitted in form defaults.`,
          severity: 'error',
        });
      }
    }
  }

  const seenFieldNames = new Set<string>();
  const topLevelFieldNames = new Set<string>(
    Array.isArray(candidate.fields)
      ? candidate.fields
          .map((f) => (f && typeof f === 'object' ? f.name : undefined))
          .filter((n): n is string => Boolean(n))
      : []
  );

  const checkRegexSyntax = (
    pattern: unknown,
    flags: unknown,
    issuePath: string,
    allowPreset = false
  ) => {
    if (typeof pattern !== 'string') {
      issues.push({
        path: issuePath,
        message: 'Regular expression pattern must be a string.',
        severity: 'error',
      });
      return;
    }
    if (allowPreset && flags === undefined && NAMED_VALIDATION_PRESETS.has(pattern)) {
      return;
    }
    if (flags !== undefined && typeof flags !== 'string') {
      issues.push({
        path: issuePath,
        message: 'Regular expression flags must be a string.',
        severity: 'error',
      });
      return;
    }
    const safety = analyzeRegexSafety(pattern, typeof flags === 'string' ? flags : undefined);
    if (!safety.safe) {
      issues.push({
        path: issuePath,
        message: `Unsafe or invalid regular expression "${pattern}": ${safety.reason ?? 'syntax error'}`,
        severity: 'error',
      });
    }
  };

  const validateCondition = (cond: unknown, condPath: string) => {
    if (!cond || typeof cond !== 'object' || Array.isArray(cond)) {
      issues.push({
        path: condPath,
        message: 'Condition expression must be a JSON object (e.g. { "field": "role", "equals": "admin" }).',
        severity: 'error',
      });
      return;
    }

    const obj = cond as Record<string, unknown>;
    if (obj.matches !== undefined) {
      if (typeof obj.matches === 'string') {
        checkRegexSyntax(obj.matches, undefined, `${condPath}.matches`);
      } else if (obj.matches && typeof obj.matches === 'object' && !Array.isArray(obj.matches)) {
        const m = obj.matches as { pattern?: unknown; flags?: unknown };
        checkRegexSyntax(m.pattern, m.flags, `${condPath}.matches.pattern`);
      }
    }
    if (obj.operator === 'matches' && obj.value !== undefined) {
      if (typeof obj.value === 'string') {
        checkRegexSyntax(obj.value, undefined, `${condPath}.value`);
      } else if (obj.value && typeof obj.value === 'object' && !Array.isArray(obj.value)) {
        const m = obj.value as { pattern?: unknown; flags?: unknown };
        checkRegexSyntax(m.pattern, m.flags, `${condPath}.value.pattern`);
      }
    }
    if (Array.isArray(obj.conditions)) {
      obj.conditions.forEach((sub, i) => validateCondition(sub, `${condPath}.conditions[${i}]`));
    }
    if (Array.isArray(obj.and)) {
      obj.and.forEach((sub, i) => validateCondition(sub, `${condPath}.and[${i}]`));
    }
    if (Array.isArray(obj.or)) {
      obj.or.forEach((sub, i) => validateCondition(sub, `${condPath}.or[${i}]`));
    }
    if (obj.not !== undefined && typeof obj.not === 'object' && obj.not !== null) {
      validateCondition(obj.not, `${condPath}.not`);
    }
  };

  const validateFieldList = (fields: readonly FieldConfig[], basePath: string, prefix = '') => {
    fields.forEach((field, idx) => {
      const itemPath = `${basePath}[${idx}]`;
      if (!field || typeof field !== 'object' || Array.isArray(field)) {
        issues.push({
          path: itemPath,
          message: 'Field definition must be a JSON object.',
          severity: 'error',
        });
        return;
      }

      if (!field.type || typeof field.type !== 'string') {
        issues.push({
          path: `${itemPath}.type`,
          message: `Field "${field.name ?? idx}" is missing a valid string "type".`,
          severity: 'error',
        });
        return;
      }

      if (!isTypeKnown(field.type)) {
        issues.push({
          path: `${itemPath}.type`,
          message: `Unknown field type "${field.type}" on field "${field.name ?? idx}". Register a custom renderer or use one of the 88 built-in field types.`,
          severity: options.strictFieldTypes ? 'error' : 'warning',
        });
      }

      if (!STRUCTURAL_TYPES_WITHOUT_NAME.has(field.type) && (!field.name || typeof field.name !== 'string' || !field.name.trim())) {
        issues.push({
          path: `${itemPath}.name`,
          message: `Input field of type "${field.type}" requires a non-empty string "name".`,
          severity: 'error',
        });
      } else if (field.name && hasUnsafePathSegment(field.name)) {
        issues.push({
          path: `${itemPath}.name`,
          message: `Unsafe reserved property segment in field name "${field.name}" (__proto__, prototype, constructor are forbidden).`,
          severity: 'error',
        });
      }

      if (field.name && typeof field.name === 'string') {
        const fullKey = prefix ? `${prefix}.${field.name}` : field.name;
        if (seenFieldNames.has(fullKey)) {
          issues.push({
            path: `${itemPath}.name`,
            message: `Duplicate field name "${fullKey}" detected.`,
            severity: 'warning',
          });
        }
        seenFieldNames.add(fullKey);
      }

      if (
        field.sensitive === false &&
        (isBuiltInSecretFieldType(field.type) ||
          Boolean(field.name && candidate.security?.sensitiveFields?.includes(field.name)))
      ) {
        issues.push({
          path: `${itemPath}.sensitive`,
          message: `Field "${field.name ?? idx}" (type "${field.type}") is a protected secret field; "sensitive: false" is ignored so draft omission, log redaction, and native privacy modifiers remain enforced.`,
          severity: 'warning',
        });
      }

      // Check choice fields without options or dataSource
      if (
        CHOICE_TYPES_EXPECTING_OPTIONS_OR_SOURCE.has(field.type) &&
        (!Array.isArray(field.options) || field.options.length === 0) &&
        !field.dataSource
      ) {
        issues.push({
          path: `${itemPath}.options`,
          message: `Selection field "${field.name ?? idx}" (type "${field.type}") should define either "options" or "dataSource".`,
          severity: 'warning',
        });
      }

      // Check computed / calculated formula
      if (field.type === 'computed' || field.type === 'calculated') {
        const hasFormulaExpr =
          typeof field.formula === 'string' && field.formula.trim().length > 0;
        if (!hasFormulaExpr) {
          if (!field.computed || typeof field.computed !== 'object' || !field.computed.operation) {
            issues.push({
              path: `${itemPath}.computed`,
              message: `Computed/calculated field "${field.name ?? idx}" requires either a "formula" expression string or a "computed" formula object with an "operation".`,
              severity: 'error',
            });
          } else if (!VALID_COMPUTED_OPERATIONS.has(field.computed.operation)) {
            issues.push({
              path: `${itemPath}.computed.operation`,
              message: `Unsupported computed operation "${field.computed.operation}". Supported: ${[...VALID_COMPUTED_OPERATIONS].join(', ')}.`,
              severity: 'error',
            });
          }
        }
      }

      if (field.formula !== undefined) {
        if (typeof field.formula !== 'string' || !field.formula.trim()) {
          issues.push({
            path: `${itemPath}.formula`,
            message: `Field "${field.name ?? idx}" "formula" must be a non-empty expression string.`,
            severity: 'error',
          });
        } else {
          const parsedFormula = parseFormula(field.formula);
          if (!parsedFormula.valid) {
            issues.push({
              path: `${itemPath}.formula`,
              message: `Invalid formula on field "${field.name ?? idx}": ${parsedFormula.error}`,
              severity: 'error',
            });
          }
        }
      }

      if (field.defaultFormula !== undefined) {
        if (typeof field.defaultFormula !== 'string' || !field.defaultFormula.trim()) {
          issues.push({
            path: `${itemPath}.defaultFormula`,
            message: `Field "${field.name ?? idx}" "defaultFormula" must be a non-empty expression string.`,
            severity: 'error',
          });
        } else {
          const parsedDefault = parseFormula(field.defaultFormula);
          if (!parsedDefault.valid) {
            issues.push({
              path: `${itemPath}.defaultFormula`,
              message: `Invalid defaultFormula on field "${field.name ?? idx}": ${parsedDefault.error}`,
              severity: 'error',
            });
          }
        }
      }

      // Check repeater & objectGroup child fields
      if (
        (field.type === 'repeater' || field.type === 'objectGroup') &&
        (!Array.isArray(field.fields) || field.fields.length === 0)
      ) {
        issues.push({
          path: `${itemPath}.fields`,
          message: `"${field.type}" field "${field.name ?? idx}" requires a non-empty "fields" array.`,
          severity: 'error',
        });
      }

      // Check stepGroup steps
      if (field.type === 'stepGroup' && (!Array.isArray(field.steps) || field.steps.length === 0)) {
        issues.push({
          path: `${itemPath}.steps`,
          message: '"stepGroup" field requires a non-empty "steps" array.',
          severity: 'error',
        });
      }

      // Check condition objects
      for (const condKey of [
        'visibleWhen',
        'hiddenWhen',
        'enabledWhen',
        'disabledWhen',
        'readOnlyWhen',
        'requiredWhen',
      ] as const) {
        if (field[condKey] !== undefined) {
          validateCondition(field[condKey], `${itemPath}.${condKey}`);
        }
      }
      if (field.validation?.when !== undefined) {
        validateCondition(field.validation.when, `${itemPath}.validation.when`);
      }

      // Check regex syntax & ReDoS safety upfront so malformed/unsafe regex in JSON is reported clearly
      if (field.validation?.regex) {
        const rules = Array.isArray(field.validation.regex)
          ? field.validation.regex
          : typeof field.validation.regex === 'string'
            ? [{ pattern: field.validation.regex }]
            : [field.validation.regex];
        for (const r of rules) {
          checkRegexSyntax(r.pattern, r.flags, `${itemPath}.validation.regex`, true);
        }
      }

      if (
        field.validation?.cnic &&
        typeof field.validation.cnic === 'object' &&
        field.validation.cnic.pattern !== undefined
      ) {
        checkRegexSyntax(
          field.validation.cnic.pattern,
          undefined,
          `${itemPath}.validation.cnic.pattern`
        );
      }

      if (
        field.validation?.phone &&
        typeof field.validation.phone === 'object' &&
        field.validation.phone.pattern !== undefined
      ) {
        checkRegexSyntax(
          field.validation.phone.pattern,
          undefined,
          `${itemPath}.validation.phone.pattern`
        );
      }

      if (field.validation?.password?.specialCharPattern !== undefined) {
        checkRegexSyntax(
          field.validation.password.specialCharPattern,
          undefined,
          `${itemPath}.validation.password.specialCharPattern`
        );
      }

      if (field.validation?.requiredWhen !== undefined) {
        validateCondition(field.validation.requiredWhen, `${itemPath}.validation.requiredWhen`);
      }

      if (field.fields && Array.isArray(field.fields)) {
        const childPrefix =
          (field.type === 'objectGroup' || field.type === 'repeater') && field.name
            ? (prefix ? `${prefix}.${field.name}` : field.name)
            : prefix;
        validateFieldList(field.fields, `${itemPath}.fields`, childPrefix);
      }

      if (field.steps && Array.isArray(field.steps)) {
        field.steps.forEach((step, sIdx) => {
          if (!step.id) {
            issues.push({
              path: `${itemPath}.steps[${sIdx}].id`,
              message: 'Each step inside "stepGroup" must have a string "id".',
              severity: 'error',
            });
          }
          if (Array.isArray(step.fields)) {
            validateFieldList(step.fields, `${itemPath}.steps[${sIdx}].fields`, prefix);
          }
        });
      }
    });
  };

  if (Array.isArray(candidate.fields)) {
    validateFieldList(candidate.fields, 'config.fields');
  }

  if (Array.isArray(candidate.sections)) {
    candidate.sections.forEach((sec, sIdx) => {
      if (!sec || typeof sec !== 'object') {
        issues.push({
          path: `config.sections[${sIdx}]`,
          message: 'Section definition must be a JSON object.',
          severity: 'error',
        });
        return;
      }
      if (!sec.id || typeof sec.id !== 'string') {
        issues.push({
          path: `config.sections[${sIdx}].id`,
          message: 'Each section must have a non-empty string "id".',
          severity: 'error',
        });
      }
      if (!Array.isArray(sec.fields)) {
        issues.push({
          path: `config.sections[${sIdx}].fields`,
          message: `Section "${sec.id ?? sIdx}" must define a "fields" array.`,
          severity: 'error',
        });
      } else {
        const inlineObjs: FieldConfig[] = [];
        sec.fields.forEach((entry: string | FieldConfig, fIdx: number) => {
          if (typeof entry === 'string') {
            if (!topLevelFieldNames.has(entry)) {
              issues.push({
                path: `config.sections[${sIdx}].fields[${fIdx}]`,
                message: `Section "${sec.id}" references field "${entry}", which does not exist in top-level "config.fields".`,
                severity: 'warning',
              });
            }
          } else {
            inlineObjs.push(entry);
          }
        });
        if (inlineObjs.length > 0) {
          validateFieldList(inlineObjs, `config.sections[${sIdx}].fields`);
        }
      }
    });
  }

  if (Array.isArray(candidate.steps)) {
    candidate.steps.forEach((step, sIdx) => {
      if (!step || typeof step !== 'object') {
        issues.push({
          path: `config.steps[${sIdx}]`,
          message: 'Wizard step definition must be a JSON object.',
          severity: 'error',
        });
        return;
      }
      if (!step.id || typeof step.id !== 'string') {
        issues.push({
          path: `config.steps[${sIdx}].id`,
          message: 'Each wizard step must have a non-empty string "id".',
          severity: 'error',
        });
      }
      if (!Array.isArray(step.fields)) {
        issues.push({
          path: `config.steps[${sIdx}].fields`,
          message: `Wizard step "${step.id ?? sIdx}" must define a "fields" array.`,
          severity: 'error',
        });
      } else {
        validateFieldList(step.fields, `config.steps[${sIdx}].fields`);
      }
    });
  }

  return finalizeResult(candidate as FormConfig, issues);
}

function finalizeResult(
  candidate: FormConfig | null,
  issues: ConfigSchemaIssue[]
): ParsedFormConfigResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const hasFatalError = errors.length > 0 || candidate === null;
  return {
    config: hasFatalError ? null : candidate,
    issues,
    errors,
    warnings,
    hasFatalError,
    valid: !hasFatalError,
  };
}

/**
 * Convenience helper for parsing and validating a custom `form.json` string or object
 * against the official ExpoForm standard.
 */
export function parseFormJson(
  jsonOrObject: string | unknown,
  options?: ParseFormConfigOptions
): ParsedFormConfigResult {
  return parseAndValidateFormConfig(jsonOrObject, options);
}

/**
 * Validates whether a custom `form.json` string or object adheres to the ExpoForm standard.
 */
export function validateFormStandard(
  jsonOrObject: string | unknown,
  options?: ParseFormConfigOptions
): {
  valid: boolean;
  errors: ConfigSchemaIssue[];
  warnings: ConfigSchemaIssue[];
  issues: ConfigSchemaIssue[];
} {
  const res = parseAndValidateFormConfig(jsonOrObject, options);
  return {
    valid: res.valid,
    errors: res.errors,
    warnings: res.warnings,
    issues: res.issues,
  };
}
