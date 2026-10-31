import { parseFormula } from '../formula';
import type {
  ConditionClause,
  ConditionExpression,
  FieldConfig,
  FormValues,
} from '../types';
import { deepEqual, getByPath, isEmptyValue } from '../utils/deepPath';
import { safeRegexTest } from '../utils/regexSafety';
import {
  ConditionRegistry,
  defaultConditionRegistry,
} from './ConditionRegistry';

export interface ConditionEvaluationContext {
  /** Form-scoped reusable named condition definitions (`config.conditions`). */
  namedConditions?: Record<string, ConditionExpression>;
  /** Optional custom ConditionRegistry (defaults to `defaultConditionRegistry`). */
  registry?: ConditionRegistry;
  /** Optional repeater row prefix when evaluating inside a repeater item (e.g. `items.1`). */
  rowPrefix?: string;
  /** Optional repeater row index (`$index`). */
  rowIndex?: number;
  /** Optional parent object/repeater prefix (`$parent.*`). */
  parentPrefix?: string;
  /** Internal recursion guard against circular `ref` definitions. */
  visitedRefs?: Set<string>;
}

const RESERVED_CLAUSE_KEYS = new Set([
  'operator',
  'conditions',
  'ref',
  'field',
  'value',
  'valueField',
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'in',
  'notIn',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'between',
  'dateBefore',
  'dateAfter',
  'matches',
  'isEmpty',
  'isNotEmpty',
  'equalsField',
  'notEqualsField',
  'and',
  'or',
  'not',
]);

function resolveScopedFieldPath(
  path: string,
  values: FormValues,
  ctx?: ConditionEvaluationContext
): unknown {
  if (path === '$index') return ctx?.rowIndex ?? 0;
  if (path.startsWith('$item.')) {
    const sub = path.slice('$item.'.length);
    return getByPath(values, ctx?.rowPrefix ? `${ctx.rowPrefix}.${sub}` : sub);
  }
  if (path.startsWith('$parent.')) {
    const sub = path.slice('$parent.'.length);
    return getByPath(values, ctx?.parentPrefix ? `${ctx.parentPrefix}.${sub}` : sub);
  }
  return getByPath(values, path);
}

function compareOrdered(actual: unknown, threshold: number | string): number | null {
  if (actual === null || actual === undefined || actual === '') return null;

  if (typeof threshold === 'number') {
    const num = typeof actual === 'number' ? actual : Number(actual);
    if (Number.isNaN(num)) return null;
    return num - threshold;
  }

  const numActual = Number(actual);
  const numThreshold = Number(threshold);
  if (
    !Number.isNaN(numActual) &&
    !Number.isNaN(numThreshold) &&
    String(actual).trim() !== '' &&
    String(threshold).trim() !== ''
  ) {
    return numActual - numThreshold;
  }

  const dateActual = Date.parse(String(actual));
  const dateThreshold = Date.parse(threshold);
  if (!Number.isNaN(dateActual) && !Number.isNaN(dateThreshold)) {
    return dateActual - dateThreshold;
  }

  return String(actual).localeCompare(threshold);
}

function compareDateOrdered(actual: unknown, threshold: unknown): number | null {
  if (actual === null || actual === undefined || actual === '') return null;
  if (threshold === null || threshold === undefined || threshold === '') return null;
  const dateActual = Date.parse(String(actual));
  const dateThreshold = Date.parse(String(threshold));
  if (Number.isNaN(dateActual) || Number.isNaN(dateThreshold)) return null;
  return dateActual - dateThreshold;
}

export function isStructuredClause(expr: ConditionExpression): expr is ConditionClause {
  if (typeof expr !== 'object' || expr === null) return false;
  const keys = Object.keys(expr);
  return keys.some((k) => RESERVED_CLAUSE_KEYS.has(k) || k === '$condition');
}

function evaluateLeafOperator(
  operator: string,
  actual: unknown,
  operand: unknown,
  fieldPath: string,
  values: FormValues,
  registry: ConditionRegistry
): boolean {
  switch (operator) {
    case 'equals':
    case 'eq':
    case '==':
      return deepEqual(actual, operand);
    case 'notEquals':
    case 'neq':
    case '!=':
      return !deepEqual(actual, operand);
    case 'greaterThan':
    case 'gt':
    case '>': {
      if (typeof operand !== 'number' && typeof operand !== 'string') return false;
      const cmp = compareOrdered(actual, operand);
      return cmp !== null && cmp > 0;
    }
    case 'greaterThanOrEqual':
    case 'gte':
    case '>=': {
      if (typeof operand !== 'number' && typeof operand !== 'string') return false;
      const cmp = compareOrdered(actual, operand);
      return cmp !== null && cmp >= 0;
    }
    case 'lessThan':
    case 'lt':
    case '<': {
      if (typeof operand !== 'number' && typeof operand !== 'string') return false;
      const cmp = compareOrdered(actual, operand);
      return cmp !== null && cmp < 0;
    }
    case 'lessThanOrEqual':
    case 'lte':
    case '<=': {
      if (typeof operand !== 'number' && typeof operand !== 'string') return false;
      const cmp = compareOrdered(actual, operand);
      return cmp !== null && cmp <= 0;
    }
    case 'contains':
      if (Array.isArray(actual)) {
        return actual.some((item) => deepEqual(item, operand));
      }
      return typeof actual === 'string' && actual.includes(String(operand ?? ''));
    case 'notContains':
      if (Array.isArray(actual)) {
        return !actual.some((item) => deepEqual(item, operand));
      }
      return typeof actual === 'string' ? !actual.includes(String(operand ?? '')) : true;
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(String(operand ?? ''));
    case 'endsWith':
      return typeof actual === 'string' && actual.endsWith(String(operand ?? ''));
    case 'in':
      return Array.isArray(operand) && operand.some((c) => deepEqual(actual, c));
    case 'notIn':
      return Array.isArray(operand) ? !operand.some((c) => deepEqual(actual, c)) : true;
    case 'isEmpty': {
      const expected = operand === undefined ? true : Boolean(operand);
      return isEmptyValue(actual) === expected;
    }
    case 'isNotEmpty': {
      const expected = operand === undefined ? true : Boolean(operand);
      return !isEmptyValue(actual) === expected;
    }
    case 'matches': {
      if (typeof actual !== 'string') return false;
      if (typeof operand === 'string') {
        const res = safeRegexTest(operand, actual);
        return !res.blocked && res.matched;
      }
      if (operand && typeof operand === 'object' && 'pattern' in operand) {
        const cfg = operand as { pattern: string; flags?: string };
        const res = safeRegexTest(cfg.pattern, actual, cfg.flags);
        return !res.blocked && res.matched;
      }
      return false;
    }
    case 'dateBefore': {
      const cmp = compareDateOrdered(actual, operand);
      return cmp !== null && cmp < 0;
    }
    case 'dateAfter': {
      const cmp = compareDateOrdered(actual, operand);
      return cmp !== null && cmp > 0;
    }
    case 'between': {
      if (!Array.isArray(operand) || operand.length < 2) return false;
      const [lo, hi] = operand as [number | string, number | string];
      const loCmp = compareOrdered(actual, lo);
      const hiCmp = compareOrdered(actual, hi);
      return loCmp !== null && hiCmp !== null && loCmp >= 0 && hiCmp <= 0;
    }
    default: {
      const custom = registry.getOperator(operator);
      if (custom) {
        return custom(actual, operand, { values, fieldPath });
      }
      return false;
    }
  }
}

export function evaluateCondition(
  expression: ConditionExpression | undefined,
  values: FormValues,
  context?: ConditionEvaluationContext
): boolean {
  if (!expression) return true;

  const registry = context?.registry ?? defaultConditionRegistry;

  if (typeof expression === 'string') {
    if (!expression.startsWith('$condition:')) return false;
    const refName = expression.slice('$condition:'.length).trim();
    if (!refName) return false;
    const visited = context?.visitedRefs ?? new Set<string>();
    if (visited.has(refName)) return false;
    const targetExpr =
      context?.namedConditions?.[refName] ?? registry.getCondition(refName);
    if (!targetExpr) return false;
    const nextVisited = new Set(visited);
    nextVisited.add(refName);
    return evaluateCondition(targetExpr, values, {
      ...context,
      visitedRefs: nextVisited,
    });
  }

  if (!isStructuredClause(expression)) {
    // Shorthand `{ accountType: 'business', country: 'PK' }` -> implicit AND of field equalities
    for (const [fieldPath, expected] of Object.entries(expression)) {
      const actual = resolveScopedFieldPath(fieldPath, values, context);
      if (Array.isArray(expected)) {
        if (!expected.some((item) => deepEqual(actual, item))) return false;
      } else if (!deepEqual(actual, expected)) {
        return false;
      }
    }
    return true;
  }

  const clause = expression;

  // 1. Named reusable condition reference (`{ ref: 'isCommercialVehicle' }` or `{ $condition: '...' }`)
  const namedRef = clause.ref ?? clause.$condition;
  if (namedRef) {
    const refName = namedRef.trim();
    const visited = context?.visitedRefs ?? new Set<string>();
    if (visited.has(refName)) {
      // Break circular condition references safely
      return false;
    }
    const targetExpr =
      context?.namedConditions?.[refName] ?? registry.getCondition(refName);
    if (!targetExpr) return false;

    const nextVisited = new Set(visited);
    nextVisited.add(refName);
    if (
      !evaluateCondition(targetExpr, values, {
        ...context,
        visitedRefs: nextVisited,
      })
    ) {
      return false;
    }
  }

  // 2. Standardized group combinators (`{ operator: 'AND' | 'OR' | 'NOT', conditions: [...] }`)
  const upperOp = clause.operator?.toUpperCase();
  if (upperOp === 'AND' || upperOp === 'OR' || upperOp === 'NOT') {
    const children = clause.conditions ?? [];
    if (upperOp === 'AND') {
      if (!children.every((sub) => evaluateCondition(sub, values, context))) {
        return false;
      }
    } else if (upperOp === 'OR') {
      if (
        children.length > 0 &&
        !children.some((sub) => evaluateCondition(sub, values, context))
      ) {
        return false;
      }
    } else if (upperOp === 'NOT') {
      if (
        children.length > 0 &&
        children.some((sub) => evaluateCondition(sub, values, context))
      ) {
        return false;
      }
    }
  }

  // 3. Shorthand logical combinators (`and`, `or`, `not`)
  if (clause.and && clause.and.length > 0) {
    if (!clause.and.every((sub) => evaluateCondition(sub, values, context))) return false;
  }

  if (clause.or && clause.or.length > 0) {
    if (!clause.or.some((sub) => evaluateCondition(sub, values, context))) return false;
  }

  if (clause.not) {
    if (evaluateCondition(clause.not, values, context)) return false;
  }

  if (!clause.field) {
    return true;
  }

  const actual = resolveScopedFieldPath(clause.field, values, context);

  // 4. Standardized leaf `{ field, operator, value | valueField }`
  if (
    clause.operator &&
    upperOp !== 'AND' &&
    upperOp !== 'OR' &&
    upperOp !== 'NOT'
  ) {
    const operand =
      clause.valueField !== undefined
        ? resolveScopedFieldPath(clause.valueField, values, context)
        : clause.value;
    if (
      !evaluateLeafOperator(
        clause.operator,
        actual,
        operand,
        clause.field,
        values,
        registry
      )
    ) {
      return false;
    }
  }

  // 5. Shorthand clause properties (all preserved for full backward compatibility)
  if (clause.equals !== undefined && !deepEqual(actual, clause.equals)) {
    return false;
  }

  if (clause.notEquals !== undefined && deepEqual(actual, clause.notEquals)) {
    return false;
  }

  if (clause.equalsField !== undefined) {
    const other = resolveScopedFieldPath(clause.equalsField, values, context);
    if (!deepEqual(actual, other)) return false;
  }

  if (clause.notEqualsField !== undefined) {
    const other = resolveScopedFieldPath(clause.notEqualsField, values, context);
    if (deepEqual(actual, other)) return false;
  }

  if (clause.contains !== undefined) {
    if (!evaluateLeafOperator('contains', actual, clause.contains, clause.field, values, registry)) {
      return false;
    }
  }

  if (clause.notContains !== undefined) {
    if (!evaluateLeafOperator('notContains', actual, clause.notContains, clause.field, values, registry)) {
      return false;
    }
  }

  if (clause.startsWith !== undefined) {
    if (!evaluateLeafOperator('startsWith', actual, clause.startsWith, clause.field, values, registry)) {
      return false;
    }
  }

  if (clause.endsWith !== undefined) {
    if (!evaluateLeafOperator('endsWith', actual, clause.endsWith, clause.field, values, registry)) {
      return false;
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

  if (clause.between !== undefined) {
    if (!evaluateLeafOperator('between', actual, clause.between, clause.field, values, registry)) {
      return false;
    }
  }

  if (clause.dateBefore !== undefined) {
    if (!evaluateLeafOperator('dateBefore', actual, clause.dateBefore, clause.field, values, registry)) {
      return false;
    }
  }

  if (clause.dateAfter !== undefined) {
    if (!evaluateLeafOperator('dateAfter', actual, clause.dateAfter, clause.field, values, registry)) {
      return false;
    }
  }

  if (clause.matches !== undefined) {
    if (!evaluateLeafOperator('matches', actual, clause.matches, clause.field, values, registry)) {
      return false;
    }
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

export function isFieldVisible(
  field: FieldConfig,
  values: FormValues,
  context?: ConditionEvaluationContext
): boolean {
  if (field.type === 'hidden' || field.hidden === true) return false;
  if (field.visibleWhen && !evaluateCondition(field.visibleWhen, values, context)) {
    return false;
  }
  if (field.hiddenWhen && evaluateCondition(field.hiddenWhen, values, context)) {
    return false;
  }
  return true;
}

export function isFieldEnabled(
  field: FieldConfig,
  values: FormValues,
  formDisabled = false,
  context?: ConditionEvaluationContext
): boolean {
  if (formDisabled || field.disabled === true) return false;
  if (field.enabledWhen && !evaluateCondition(field.enabledWhen, values, context)) {
    return false;
  }
  if (field.disabledWhen && evaluateCondition(field.disabledWhen, values, context)) {
    return false;
  }
  return true;
}

export function isFieldReadOnly(
  field: FieldConfig,
  values: FormValues,
  formReadOnly = false,
  context?: ConditionEvaluationContext
): boolean {
  if (formReadOnly || field.readOnly === true) return true;
  if (field.type === 'computed' || field.type === 'calculated') return true;
  if (field.readOnlyWhen && evaluateCondition(field.readOnlyWhen, values, context)) {
    return true;
  }
  return false;
}

export function isFieldRequired(
  field: FieldConfig,
  values: FormValues,
  schemaRequiredFields?: ReadonlySet<string>,
  fieldPath?: string,
  context?: ConditionEvaluationContext
): boolean {
  if (field.required === true) return true;
  if (
    field.validation?.required === true ||
    typeof field.validation?.required === 'string'
  ) {
    return true;
  }
  const key = fieldPath ?? field.name;
  if (key && schemaRequiredFields?.has(key)) return true;

  const cond = field.requiredWhen ?? field.validation?.requiredWhen;
  if (cond && evaluateCondition(cond, values, context)) {
    return true;
  }
  return false;
}

export interface ExtractConditionPathsOptions {
  namedConditions?: Record<string, ConditionExpression>;
  registry?: ConditionRegistry;
  repeaterTemplatePrefix?: string;
  visitedRefs?: Set<string>;
}

function normalizeExtractedPath(rawPath: string, repeaterTemplatePrefix?: string): string {
  if (rawPath.startsWith('$item.')) {
    const sub = rawPath.slice('$item.'.length);
    return repeaterTemplatePrefix ? `${repeaterTemplatePrefix}.${sub}` : sub;
  }
  if (rawPath.startsWith('$parent.')) {
    return rawPath.slice('$parent.'.length);
  }
  return rawPath;
}

export function extractConditionFieldPaths(
  expression: ConditionExpression | undefined,
  acc: Set<string> = new Set(),
  options?: ExtractConditionPathsOptions
): Set<string> {
  if (!expression) return acc;

  const addPath = (p: string | undefined) => {
    if (!p || p === '$index') return;
    acc.add(normalizeExtractedPath(p, options?.repeaterTemplatePrefix));
  };

  if (typeof expression === 'string') {
    if (expression.startsWith('$condition:')) {
      const refName = expression.slice('$condition:'.length).trim();
      const visited = options?.visitedRefs ?? new Set<string>();
      if (refName && !visited.has(refName)) {
        const nextVisited = new Set(visited);
        nextVisited.add(refName);
        const registry = options?.registry ?? defaultConditionRegistry;
        const target =
          options?.namedConditions?.[refName] ?? registry.getCondition(refName);
        if (target) {
          extractConditionFieldPaths(target, acc, {
            ...options,
            visitedRefs: nextVisited,
          });
        }
      }
    }
    return acc;
  }

  if (!isStructuredClause(expression)) {
    for (const key of Object.keys(expression)) {
      addPath(key);
    }
    return acc;
  }

  const namedRef = expression.ref ?? expression.$condition;
  if (namedRef) {
    const refName = namedRef.trim();
    const visited = options?.visitedRefs ?? new Set<string>();
    if (!visited.has(refName)) {
      const nextVisited = new Set(visited);
      nextVisited.add(refName);
      const registry = options?.registry ?? defaultConditionRegistry;
      const target =
        options?.namedConditions?.[refName] ?? registry.getCondition(refName);
      if (target) {
        extractConditionFieldPaths(target, acc, {
          ...options,
          visitedRefs: nextVisited,
        });
      }
    }
  }

  addPath(expression.field);
  addPath(expression.valueField);
  addPath(expression.equalsField);
  addPath(expression.notEqualsField);

  if (expression.conditions) {
    for (const sub of expression.conditions) {
      extractConditionFieldPaths(sub, acc, options);
    }
  }
  if (expression.and) {
    for (const sub of expression.and) {
      extractConditionFieldPaths(sub, acc, options);
    }
  }
  if (expression.or) {
    for (const sub of expression.or) {
      extractConditionFieldPaths(sub, acc, options);
    }
  }
  if (expression.not) {
    extractConditionFieldPaths(expression.not, acc, options);
  }

  return acc;
}

/**
 * Builds a reverse dependency map: `sourceFieldPath -> Set<dependentFieldPaths>`.
 * Preserved for backward compatibility and augmented with `readOnlyWhen` and `validation.when`.
 */
export function buildDependencyGraph(
  fields: readonly FieldConfig[],
  prefix = '',
  namedConditions?: Record<string, ConditionExpression>
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  const addEdge = (source: string, dependent: string) => {
    if (!source || !dependent || source === dependent) return;
    let set = graph.get(source);
    if (!set) {
      set = new Set();
      graph.set(source, set);
    }
    set.add(dependent);
  };

  const walk = (list: readonly FieldConfig[], pathPrefix: string) => {
    for (const field of list) {
      const fieldPath = field.name
        ? pathPrefix
          ? `${pathPrefix}.${field.name}`
          : field.name
        : pathPrefix;

      if (fieldPath) {
        const sources = new Set<string>();
        const opts: ExtractConditionPathsOptions = { namedConditions };
        extractConditionFieldPaths(field.visibleWhen, sources, opts);
        extractConditionFieldPaths(field.hiddenWhen, sources, opts);
        extractConditionFieldPaths(field.enabledWhen, sources, opts);
        extractConditionFieldPaths(field.disabledWhen, sources, opts);
        extractConditionFieldPaths(field.readOnlyWhen, sources, opts);
        extractConditionFieldPaths(field.requiredWhen, sources, opts);
        extractConditionFieldPaths(field.validation?.requiredWhen, sources, opts);
        extractConditionFieldPaths(field.validation?.when, sources, opts);

        if (typeof field.dataSource === 'object' && field.dataSource?.dependsOn) {
          for (const dep of field.dataSource.dependsOn) sources.add(dep);
        }

        if (field.computed?.fields) {
          for (const dep of field.computed.fields) sources.add(dep);
        }
        if (field.computed?.when) {
          extractConditionFieldPaths(field.computed.when, sources, opts);
        }

        if (field.validation?.equalsField) sources.add(field.validation.equalsField);
        if (field.validation?.notEqualsField) sources.add(field.validation.notEqualsField);
        if (field.validation?.greaterThanField) sources.add(field.validation.greaterThanField);
        if (field.validation?.lessThanField) sources.add(field.validation.lessThanField);
        if (field.validation?.crossField) {
          for (const cf of field.validation.crossField) {
            if (cf.targetField) sources.add(cf.targetField);
            extractConditionFieldPaths(cf.when, sources, opts);
          }
        }

        for (const src of sources) {
          addEdge(src, fieldPath);
        }
      }

      if (field.fields && field.type !== 'repeater' && field.type !== 'array') {
        walk(field.fields, field.type === 'object' ? fieldPath : pathPrefix);
      }
    }
  };

  walk(fields, prefix);
  return graph;
}

export function collectFieldDependencies(
  field: FieldConfig,
  options?: ExtractConditionPathsOptions
): string[] {
  const deps = new Set<string>();
  extractConditionFieldPaths(field.visibleWhen, deps, options);
  extractConditionFieldPaths(field.hiddenWhen, deps, options);
  extractConditionFieldPaths(field.enabledWhen, deps, options);
  extractConditionFieldPaths(field.disabledWhen, deps, options);
  extractConditionFieldPaths(field.readOnlyWhen, deps, options);
  extractConditionFieldPaths(field.requiredWhen, deps, options);
  extractConditionFieldPaths(field.validation?.requiredWhen, deps, options);
  extractConditionFieldPaths(field.validation?.when, deps, options);

  if (field.type === 'confirmPassword') {
    deps.add(field.passwordField ?? field.validation?.equalsField ?? 'password');
  }
  if (field.passwordField) deps.add(field.passwordField);
  if (field.countryField) deps.add(field.countryField);
  if (field.validation?.equalsField) deps.add(field.validation.equalsField);
  if (field.validation?.notEqualsField) deps.add(field.validation.notEqualsField);
  if (field.validation?.greaterThanField) deps.add(field.validation.greaterThanField);
  if (field.validation?.lessThanField) deps.add(field.validation.lessThanField);
  if (field.validation?.notBeforeField) deps.add(field.validation.notBeforeField);
  if (field.validation?.notAfterField) deps.add(field.validation.notAfterField);
  if (field.validation?.phone?.countryField) deps.add(field.validation.phone.countryField);
  if (field.validation?.postalCodeCountryField) deps.add(field.validation.postalCodeCountryField);

  if (field.validation?.crossField) {
    for (const rule of field.validation.crossField) {
      if (rule.targetField) deps.add(rule.targetField);
      extractConditionFieldPaths(rule.when, deps, options);
    }
  }

  if (field.validation?.async) {
    const asyncList = Array.isArray(field.validation.async)
      ? field.validation.async
      : [field.validation.async];
    for (const a of asyncList) {
      if (a.dependsOn) {
        for (const d of a.dependsOn) deps.add(d);
      }
      extractConditionFieldPaths(a.when, deps, options);
    }
  }

  if (typeof field.dataSource === 'object' && field.dataSource.dependsOn) {
    for (const d of field.dataSource.dependsOn) deps.add(d);
  }

  if (field.computed?.fields) {
    for (const f of field.computed.fields) deps.add(f);
  }
  if (field.computed?.template) {
    const matches = field.computed.template.matchAll(/\{\{\s*([a-zA-Z0-9_.$[\]]+)\s*\}\}/g);
    for (const m of matches) {
      if (m[1]) deps.add(m[1]);
    }
  }
  extractConditionFieldPaths(field.computed?.when, deps, options);

  if (typeof field.formula === 'string' && field.formula.trim()) {
    const parsed = parseFormula(field.formula, {
      repeaterTemplatePrefix: options?.repeaterTemplatePrefix,
    });
    for (const d of parsed.dependencies) deps.add(d);
  }
  if (typeof field.defaultFormula === 'string' && field.defaultFormula.trim()) {
    const parsedDefault = parseFormula(field.defaultFormula, {
      repeaterTemplatePrefix: options?.repeaterTemplatePrefix,
    });
    for (const d of parsedDefault.dependencies) deps.add(d);
  }

  return Array.from(deps);
}
