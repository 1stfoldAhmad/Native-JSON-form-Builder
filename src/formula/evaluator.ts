import type { FormValues } from '../types';
import { deepEqual, getByPath } from '../utils/deepPath';
import {
  defaultFormulaFunctionRegistry,
  FormulaFunctionRegistry,
  toFiniteNumber,
} from './functions';
import { parseFormula, type FormulaASTNode } from './parser';

export interface FormulaScopeContext {
  /** Concrete repeater item path prefix when evaluating inside a row (e.g. `items.2`). */
  rowPrefix?: string;
  /** Zero-based repeater row index when evaluating inside a row. */
  rowIndex?: number;
  /** Parent object/repeater prefix when nested (`$parent.*`). */
  parentPrefix?: string;
  /** Injectable deterministic clock for `TODAY()` / `AGE()`. */
  now?: () => Date;
  /** Custom or scoped function registry. */
  functionRegistry?: FormulaFunctionRegistry;
  /** Optional decimal rounding precision applied to final numeric output. */
  precision?: number;
}

export interface FormulaEvalResult {
  value: unknown;
  error?: string;
}

/**
 * Resolves a field reference path against `values`, including repeater row scope
 * (`$item.qty`, `$index`, `$parent.discount`) and wildcard collection slices (`items.*.amount`).
 */
export function resolveFormulaFieldPath(
  rawPath: string,
  values: FormValues,
  scope?: FormulaScopeContext
): unknown {
  if (rawPath === '$index') {
    return scope?.rowIndex ?? 0;
  }

  if (rawPath.startsWith('$item.')) {
    const sub = rawPath.slice('$item.'.length);
    const full = scope?.rowPrefix ? `${scope.rowPrefix}.${sub}` : sub;
    return getByPath(values, full);
  }

  if (rawPath.startsWith('$parent.')) {
    const sub = rawPath.slice('$parent.'.length);
    const full = scope?.parentPrefix ? `${scope.parentPrefix}.${sub}` : sub;
    return getByPath(values, full);
  }

  if (!rawPath.includes('*')) {
    return getByPath(values, rawPath);
  }

  // Wildcard array projection e.g. `items.*.amount` -> `[10, 25, 40]`
  const segments = rawPath.split('.');
  const collectWildcard = (current: unknown, idx: number): unknown[] => {
    if (current === null || current === undefined) return [];
    if (idx >= segments.length) return [current];

    const seg = segments[idx];
    if (seg === '*') {
      if (!Array.isArray(current)) return [];
      const out: unknown[] = [];
      for (const item of current) {
        out.push(...collectWildcard(item, idx + 1));
      }
      return out;
    }

    if (typeof current === 'object' && !Array.isArray(current)) {
      const next = (current as Record<string, unknown>)[seg];
      return collectWildcard(next, idx + 1);
    }
    return [];
  };

  return collectWildcard(values, 0);
}

function isNumericLike(val: unknown): boolean {
  if (typeof val === 'number') return Number.isFinite(val);
  if (val === null || val === undefined || val === '') return true;
  if (typeof val === 'string' && val.trim() !== '') {
    return Number.isFinite(Number(val));
  }
  return false;
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'string' && typeof right === 'string') {
    const lNum = Number(left);
    const rNum = Number(right);
    if (left.trim() !== '' && right.trim() !== '' && Number.isFinite(lNum) && Number.isFinite(rNum)) {
      return lNum - rNum;
    }
    return left.localeCompare(right);
  }
  return toFiniteNumber(left) - toFiniteNumber(right);
}

function evalNode(
  node: FormulaASTNode,
  values: FormValues,
  registry: FormulaFunctionRegistry,
  nowFn: () => Date,
  scope?: FormulaScopeContext
): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'field':
      return resolveFormulaFieldPath(node.path, values, scope);

    case 'unary': {
      const val = evalNode(node.operand, values, registry, nowFn, scope);
      switch (node.operator) {
        case '-':
          return -toFiniteNumber(val);
        case '+':
          return toFiniteNumber(val);
        case '!':
          return !val;
      }
      return undefined;
    }

    case 'conditional': {
      const cond = evalNode(node.test, values, registry, nowFn, scope);
      return cond
        ? evalNode(node.consequent, values, registry, nowFn, scope)
        : evalNode(node.alternate, values, registry, nowFn, scope);
    }

    case 'binary': {
      if (node.operator === '&&') {
        const left = evalNode(node.left, values, registry, nowFn, scope);
        return left ? evalNode(node.right, values, registry, nowFn, scope) : left;
      }
      if (node.operator === '||') {
        const left = evalNode(node.left, values, registry, nowFn, scope);
        return left ? left : evalNode(node.right, values, registry, nowFn, scope);
      }

      const left = evalNode(node.left, values, registry, nowFn, scope);
      const right = evalNode(node.right, values, registry, nowFn, scope);

      switch (node.operator) {
        case '+': {
          if (isNumericLike(left) && isNumericLike(right)) {
            return toFiniteNumber(left) + toFiniteNumber(right);
          }
          return `${left ?? ''}${right ?? ''}`;
        }
        case '-':
          return toFiniteNumber(left) - toFiniteNumber(right);
        case '*':
          return toFiniteNumber(left) * toFiniteNumber(right);
        case '/': {
          const denom = toFiniteNumber(right);
          if (denom === 0) return 0;
          return toFiniteNumber(left) / denom;
        }
        case '%': {
          const denom = toFiniteNumber(right);
          if (denom === 0) return 0;
          return toFiniteNumber(left) % denom;
        }
        case '==':
          if (left == null && right == null) return true;
          if (isNumericLike(left) && isNumericLike(right) && left !== '' && right !== '') {
            return toFiniteNumber(left) === toFiniteNumber(right);
          }
          return deepEqual(left, right);
        case '!=':
          if (left == null && right == null) return false;
          if (isNumericLike(left) && isNumericLike(right) && left !== '' && right !== '') {
            return toFiniteNumber(left) !== toFiniteNumber(right);
          }
          return !deepEqual(left, right);
        case '<':
          return compareValues(left, right) < 0;
        case '<=':
          return compareValues(left, right) <= 0;
        case '>':
          return compareValues(left, right) > 0;
        case '>=':
          return compareValues(left, right) >= 0;
      }
      return undefined;
    }

    case 'call': {
      const fnEntry = registry.get(node.callee);
      if (!fnEntry) {
        throw new Error(`Unknown formula function "${node.callee}"`);
      }
      // Lazy-evaluate branches for IF(cond, then, else)
      if (node.callee === 'IF') {
        const cond = evalNode(node.args[0], values, registry, nowFn, scope);
        if (cond) {
          return node.args[1]
            ? evalNode(node.args[1], values, registry, nowFn, scope)
            : null;
        }
        return node.args[2]
          ? evalNode(node.args[2], values, registry, nowFn, scope)
          : null;
      }
      const resolvedArgs = node.args.map((arg) =>
        evalNode(arg, values, registry, nowFn, scope)
      );
      return fnEntry.fn(resolvedArgs, { now: nowFn });
    }
  }
}

/**
 * Evaluates a formula string or pre-parsed `FormulaASTNode` deterministically
 * against `values` without arbitrary code execution.
 */
export function evaluateFormula(
  expressionOrAst: string | FormulaASTNode,
  values: FormValues,
  scope?: FormulaScopeContext
): FormulaEvalResult {
  let ast: FormulaASTNode;
  if (typeof expressionOrAst === 'string') {
    const parsed = parseFormula(expressionOrAst);
    if (!parsed.valid || !parsed.ast) {
      return { value: undefined, error: parsed.error ?? 'Invalid formula expression' };
    }
    ast = parsed.ast;
  } else {
    ast = expressionOrAst;
  }

  const registry = scope?.functionRegistry ?? defaultFormulaFunctionRegistry;
  const nowFn = scope?.now ?? (() => new Date());

  try {
    let output = evalNode(ast, values, registry, nowFn, scope);
    if (typeof output === 'number') {
      if (!Number.isFinite(output)) {
        output = 0;
      } else if (scope?.precision !== undefined) {
        const factor = 10 ** scope.precision;
        output = Math.round((output + Number.EPSILON) * factor) / factor;
      }
    }
    return { value: output };
  } catch (err) {
    return {
      value: undefined,
      error: err instanceof Error ? err.message : 'Formula evaluation error',
    };
  }
}
