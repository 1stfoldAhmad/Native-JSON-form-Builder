import type { ConfigSchemaIssue, FieldConfig, FormConfig } from '../types';

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

/**
 * Validates and normalizes an incoming JSON `FormConfig`, reporting clear,
 * developer-friendly configuration issues rather than crashing silently (Section 14 & 17).
 */
export function parseAndValidateFormConfig(
  rawConfig: unknown,
  isRegisteredFieldType?: (type: string) => boolean
): {
  config: FormConfig | null;
  issues: ConfigSchemaIssue[];
  hasFatalError: boolean;
} {
  const issues: ConfigSchemaIssue[] = [];

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    issues.push({
      path: 'config',
      message: 'Form configuration must be a non-null JSON object.',
      severity: 'error',
    });
    return { config: null, issues, hasFatalError: true };
  }

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

  const seenFieldNames = new Set<string>();

  const validateFieldList = (fields: readonly FieldConfig[], basePath: string, prefix = '') => {
    fields.forEach((field, idx) => {
      const itemPath = `${basePath}[${idx}]`;
      if (!field || typeof field !== 'object') {
        issues.push({
          path: itemPath,
          message: 'Field definition must be an object.',
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

      if (isRegisteredFieldType && !isRegisteredFieldType(field.type)) {
        issues.push({
          path: `${itemPath}.type`,
          message: `Unknown field type "${field.type}" on field "${field.name ?? idx}". Register a custom renderer or use a built-in field type.`,
          severity: 'warning',
        });
      }

      if (!STRUCTURAL_TYPES_WITHOUT_NAME.has(field.type) && !field.name) {
        issues.push({
          path: `${itemPath}.name`,
          message: `Input field of type "${field.type}" requires a "name" property.`,
          severity: 'error',
        });
      }

      if (field.name) {
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

      // Check regex syntax upfront so malformed regex in JSON is reported clearly
      if (field.validation?.regex) {
        const rules = Array.isArray(field.validation.regex)
          ? field.validation.regex
          : typeof field.validation.regex === 'string'
            ? [{ pattern: field.validation.regex }]
            : [field.validation.regex];
        for (const r of rules) {
          try {
            // eslint-disable-next-line no-new
            new RegExp(r.pattern, r.flags);
          } catch (e) {
            issues.push({
              path: `${itemPath}.validation.regex`,
              message: `Invalid regular expression "${r.pattern}": ${e instanceof Error ? e.message : 'syntax error'}`,
              severity: 'error',
            });
          }
        }
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
      if (!sec.id) {
        issues.push({
          path: `config.sections[${sIdx}].id`,
          message: 'Each section must have a string "id".',
          severity: 'error',
        });
      }
      if (Array.isArray(sec.fields)) {
        const inlineObjs = sec.fields.filter(
          (f: string | FieldConfig): f is FieldConfig => typeof f !== 'string'
        );
        validateFieldList(inlineObjs, `config.sections[${sIdx}].fields`);
      }
    });
  }

  if (Array.isArray(candidate.steps)) {
    candidate.steps.forEach((step, sIdx) => {
      if (!step.id) {
        issues.push({
          path: `config.steps[${sIdx}].id`,
          message: 'Each wizard step must have a string "id".',
          severity: 'error',
        });
      }
      if (Array.isArray(step.fields)) {
        validateFieldList(step.fields, `config.steps[${sIdx}].fields`);
      }
    });
  }

  const hasFatalError = issues.some((i) => i.severity === 'error');
  return {
    config: hasFatalError ? null : (candidate as FormConfig),
    issues,
    hasFatalError,
  };
}
