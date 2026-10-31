import type {
  ConditionClause,
  ConditionExpression,
  FieldConfig,
  FormValues,
} from '../types';
import { deepEqual, getByPath, isEmptyValue } from '../utils/deepPath';
import { safeRegexTest } from '../utils/regexSafety';

const RESERVED_CLAUSE_KEYS = new Set([
  'field',
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'in',
  'notIn',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'matches',
  'isEmpty',
  'isNotEmpty',
  'equalsField',
  'notEqualsField',
  'and',
  'or',
  'not',
]);

function compareOrdered(actual: unknown, threshold: number | string): number | null {
  if (actual === null || actual === undefined || actual === '') return null;

  if (typeof threshold === 'number') {
    const num = typeof actual === 'number' ? actual : Number(actual);
    if (Number.isNaN(num)) return null;
    return num - threshold;
  }

  // Try numeric first if both look numeric, otherwise ISO / Date comparison or lexicographical
  const numActual = Number(actual);
  const numThreshold = Number(threshold);
  if (!Number.isNaN(numActual) && !Number.isNaN(numThreshold) && String(actual).trim() !== '') {
    return numActual - numThreshold;
  }

  const dateActual = Date.parse(String(actual));
  const dateThreshold = Date.parse(threshold);
  if (!Number.isNaN(dateActual) && !Number.isNaN(dateThreshold)) {
    return dateActual - dateThreshold;
  }

  return String(actual).localeCompare(threshold);
}

function isStructuredClause(expr: ConditionExpression): expr is ConditionClause {
  const keys = Object.keys(expr);
  return keys.some((k) => RESERVED_CLAUSE_KEYS.has(k));
}

export function evaluateCondition(
  expression: ConditionExpression | undefined,
  values: FormValues
): boolean {
  if (!expression) return true;

  if (!isStructuredClause(expression)) {
    // Shorthand `{ accountType: 'business', country: 'PK' }` -> implicit AND of field equalities
    for (const [fieldPath, expected] of Object.entries(expression)) {
      const actual = getByPath(values, fieldPath);
      if (Array.isArray(expected)) {
        if (!expected.some((item) => deepEqual(actual, item))) return false;
      } else if (!deepEqual(actual, expected)) {
        return false;
      }
    }
    return true;
  }

  const clause = expression;

  if (clause.and && clause.and.length > 0) {
    if (!clause.and.every((sub) => evaluateCondition(sub, values))) return false;
  }

  if (clause.or && clause.or.length > 0) {
    if (!clause.or.some((sub) => evaluateCondition(sub, values))) return false;
  }

  if (clause.not) {
    if (evaluateCondition(clause.not, values)) return false;
  }

  if (!clause.field) {
    return true;
  }

  const actual = getByPath(values, clause.field);

  if (clause.equals !== undefined && !deepEqual(actual, clause.equals)) {
    return false;
  }

  if (clause.notEquals !== undefined && deepEqual(actual, clause.notEquals)) {
    return false;
  }

  if (clause.equalsField !== undefined) {
    const other = getByPath(values, clause.equalsField);
    if (!deepEqual(actual, other)) return false;
  }

  if (clause.notEqualsField !== undefined) {
    const other = getByPath(values, clause.notEqualsField);
    if (deepEqual(actual, other)) return false;
  }

  if (clause.contains !== undefined) {
    if (Array.isArray(actual)) {
      if (!actual.some((item) => deepEqual(item, clause.contains))) return false;
    } else if (typeof actual === 'string') {
      if (!actual.includes(String(clause.contains))) return false;
    } else {
      return false;
    }
  }

  if (clause.notContains !== undefined) {
    if (Array.isArray(actual)) {
      if (actual.some((item) => deepEqual(item, clause.notContains))) return false;
    } else if (typeof actual === 'string') {
      if (actual.includes(String(clause.notContains))) return false;
    }
  }

  if (clause.in !== undefined) {
    if (!clause.in.some((candidate) => deepEqual(actual, candidate))) return false;
  }

  if (clause.notIn !== undefined) {
    if (clause.notIn.some((candidate) => deepEqual(actual, candidate))) return false;
  }

  if (clause.greaterThan !== undefined) {
    const cmp = compareOrdered(actual, clause.greaterThan);
    if (cmp === null || !(cmp > 0)) return false;
  }

  if (clause.greaterThanOrEqual !== undefined) {
    const cmp = compareOrdered(actual, clause.greaterThanOrEqual);
    if (cmp === null || !(cmp >= 0)) return false;
  }

  if (clause.lessThan !== undefined) {
    const cmp = compareOrdered(actual, clause.lessThan);
    if (cmp === null || !(cmp < 0)) return false;
  }

  if (clause.lessThanOrEqual !== undefined) {
    const cmp = compareOrdered(actual, clause.lessThanOrEqual);
    if (cmp === null || !(cmp <= 0)) return false;
  }

  if (clause.matches !== undefined) {
    if (typeof actual !== 'string') return false;
    const matchRes =
      typeof clause.matches === 'string'
        ? safeRegexTest(clause.matches, actual)
        : safeRegexTest(clause.matches.pattern, actual, clause.matches.flags);
    if (matchRes.blocked || !matchRes.matched) return false;
  }

  if (clause.isEmpty !== undefined) {
    const empty = isEmptyValue(actual);
    if (clause.isEmpty !== empty) return false;
  }

  if (clause.isNotEmpty !== undefined) {
    const notEmpty = !isEmptyValue(actual);
    if (clause.isNotEmpty !== notEmpty) return false;
  }

  return true;
}

export function isFieldVisible(field: FieldConfig, values: FormValues): boolean {
  if (field.type === 'hidden' || field.hidden === true) return false;
  if (field.visibleWhen && !evaluateCondition(field.visibleWhen, values)) {
    return false;
  }
  if (field.hiddenWhen && evaluateCondition(field.hiddenWhen, values)) {
    return false;
  }
  return true;
}

export function isFieldEnabled(
  field: FieldConfig,
  values: FormValues,
  formDisabled = false
): boolean {
  if (formDisabled || field.disabled === true) return false;
  if (field.enabledWhen && !evaluateCondition(field.enabledWhen, values)) {
    return false;
  }
  if (field.disabledWhen && evaluateCondition(field.disabledWhen, values)) {
    return false;
  }
  return true;
}

export function isFieldRequired(
  field: FieldConfig,
  values: FormValues,
  schemaRequiredFields?: ReadonlySet<string>,
  fieldPath?: string
): boolean {
  if (field.required === true) return true;
  if (field.validation?.required === true || typeof field.validation?.required === 'string') {
    return true;
  }
  const key = fieldPath ?? field.name;
  if (key && schemaRequiredFields?.has(key)) return true;

  const cond = field.requiredWhen ?? field.validation?.requiredWhen;
  if (cond && evaluateCondition(cond, values)) {
    return true;
  }
  return false;
}

export function extractConditionFieldPaths(
  expression: ConditionExpression | undefined,
  acc: Set<string> = new Set()
): Set<string> {
  if (!expression) return acc;

  if (!isStructuredClause(expression)) {
    for (const key of Object.keys(expression)) {
      acc.add(key);
    }
    return acc;
  }

  if (expression.field) acc.add(expression.field);
  if (expression.equalsField) acc.add(expression.equalsField);
  if (expression.notEqualsField) acc.add(expression.notEqualsField);
  if (expression.and) {
    for (const sub of expression.and) extractConditionFieldPaths(sub, acc);
  }
  if (expression.or) {
    for (const sub of expression.or) extractConditionFieldPaths(sub, acc);
  }
  if (expression.not) {
    extractConditionFieldPaths(expression.not, acc);
  }
  return acc;
}

export function collectFieldDependencies(field: FieldConfig): string[] {
  const deps = new Set<string>();
  extractConditionFieldPaths(field.visibleWhen, deps);
  extractConditionFieldPaths(field.hiddenWhen, deps);
  extractConditionFieldPaths(field.enabledWhen, deps);
  extractConditionFieldPaths(field.disabledWhen, deps);
  extractConditionFieldPaths(field.requiredWhen, deps);
  extractConditionFieldPaths(field.validation?.requiredWhen, deps);

  if (field.type === 'confirmPassword') {
    deps.add(field.passwordField ?? field.validation?.equalsField ?? 'password');
  }
  if (field.passwordField) deps.add(field.passwordField);
  if (field.countryField) deps.add(field.countryField);
  if (field.validation?.equalsField) deps.add(field.validation.equalsField);
  if (field.validation?.notBeforeField) deps.add(field.validation.notBeforeField);
  if (field.validation?.notAfterField) deps.add(field.validation.notAfterField);
  if (field.validation?.phone?.countryField) deps.add(field.validation.phone.countryField);
  if (field.validation?.postalCodeCountryField) deps.add(field.validation.postalCodeCountryField);

  if (field.validation?.crossField) {
    for (const rule of field.validation.crossField) {
      if (rule.targetField) deps.add(rule.targetField);
      extractConditionFieldPaths(rule.when, deps);
    }
  }

  if (typeof field.dataSource === 'object' && field.dataSource.dependsOn) {
    for (const d of field.dataSource.dependsOn) deps.add(d);
  }

  if (field.computed?.fields) {
    for (const f of field.computed.fields) deps.add(f);
  }
  if (field.computed?.template) {
    const matches = field.computed.template.matchAll(/\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g);
    for (const m of matches) {
      if (m[1]) deps.add(m[1]);
    }
  }
  extractConditionFieldPaths(field.computed?.when, deps);

  return Array.from(deps);
}
