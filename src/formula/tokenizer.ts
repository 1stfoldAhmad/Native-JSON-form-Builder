import { hasUnsafePathSegment } from '../utils/deepPath';

export const MAX_FORMULA_LENGTH = 2_048;
export const MAX_FORMULA_TOKENS = 512;

export type FormulaTokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'identifier'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'question'
  | 'colon'
  | 'eof';

export interface FormulaToken {
  type: FormulaTokenType;
  value: string;
  position: number;
}

export class FormulaSyntaxError extends Error {
  public readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} (at position ${position})`);
    this.name = 'FormulaSyntaxError';
    this.position = position;
  }
}

const FORBIDDEN_IDENTIFIERS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'globalThis',
  'window',
  'global',
  'process',
  'eval',
  'Function',
]);

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    ch === '_' ||
    ch === '$'
  );
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

/**
 * Tokenizes a restricted formula expression string without `eval` or `Function`.
 * Supports field paths (`baseFee`, `account.rate`, `items.*.amount`, `$item.qty`, `$index`),
 * numbers, quoted strings, booleans, null, arithmetic/logical/comparison operators,
 * ternary `? :`, and pure function calls (`SUM(...)`, `ROUND(...)`).
 */
export function tokenizeFormula(source: string): FormulaToken[] {
  if (typeof source !== 'string') {
    throw new FormulaSyntaxError('Formula expression must be a string', 0);
  }
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula exceeds maximum length of ${MAX_FORMULA_LENGTH} characters`,
      0
    );
  }

  const tokens: FormulaToken[] = [];
  let i = 0;

  while (i < source.length) {
    if (tokens.length >= MAX_FORMULA_TOKENS) {
      throw new FormulaSyntaxError(
        `Formula exceeds maximum token count of ${MAX_FORMULA_TOKENS}`,
        i
      );
    }

    const ch = source[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // String literal ('...' or "...")
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i += 1;
      let str = '';
      let closed = false;
      while (i < source.length) {
        const cur = source[i];
        if (cur === '\\') {
          const next = source[i + 1];
          if (next === undefined) {
            throw new FormulaSyntaxError('Unterminated escape in string literal', i);
          }
          switch (next) {
            case 'n':
              str += '\n';
              break;
            case 't':
              str += '\t';
              break;
            case 'r':
              str += '\r';
              break;
            default:
              str += next;
              break;
          }
          i += 2;
          continue;
        }
        if (cur === quote) {
          closed = true;
          i += 1;
          break;
        }
        str += cur;
        i += 1;
      }
      if (!closed) {
        throw new FormulaSyntaxError('Unterminated string literal', start);
      }
      tokens.push({ type: 'string', value: str, position: start });
      continue;
    }

    // Numeric literal (123, 45.67, .5)
    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] ?? ''))) {
      const start = i;
      let hasDot = false;
      while (i < source.length) {
        const c = source[i];
        if (isDigit(c)) {
          i += 1;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          i += 1;
        } else {
          break;
        }
      }
      const raw = source.slice(start, i);
      if (raw === '.' || Number.isNaN(Number(raw))) {
        throw new FormulaSyntaxError(`Invalid numeric literal "${raw}"`, start);
      }
      tokens.push({ type: 'number', value: raw, position: start });
      continue;
    }

    // Identifiers, dotted field paths (`a.b`, `items.*.price`, `$item.qty`), keywords (`true`, `false`, `null`)
    if (isIdentStart(ch)) {
      const start = i;
      let path = '';
      while (i < source.length) {
        if (isIdentPart(source[i])) {
          path += source[i];
          i += 1;
        } else if (
          source[i] === '.' &&
          (isIdentStart(source[i + 1] ?? '') ||
            isDigit(source[i + 1] ?? '') ||
            source[i + 1] === '*')
        ) {
          path += '.';
          i += 1;
          if (source[i] === '*') {
            path += '*';
            i += 1;
          } else {
            while (i < source.length && (isIdentPart(source[i]) || isDigit(source[i]))) {
              path += source[i];
              i += 1;
            }
          }
        } else {
          break;
        }
      }

      if (path === 'true' || path === 'false') {
        tokens.push({ type: 'boolean', value: path, position: start });
        continue;
      }
      if (path === 'null') {
        tokens.push({ type: 'null', value: 'null', position: start });
        continue;
      }

      const segments = path.split('.');
      for (const seg of segments) {
        if (FORBIDDEN_IDENTIFIERS.has(seg) || hasUnsafePathSegment(seg)) {
          throw new FormulaSyntaxError(
            `Forbidden identifier "${seg}" in formula expression`,
            start
          );
        }
      }

      // Disallow chained method call syntax like `foo.bar(` to keep function namespace explicit
      if (path.includes('.') && source[i] === '(') {
        throw new FormulaSyntaxError(
          `Member function calls ("${path}(...)") are not permitted; use top-level registered functions`,
          start
        );
      }

      tokens.push({ type: 'identifier', value: path, position: start });
      continue;
    }

    // Punctuation
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', position: i });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', position: i });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', position: i });
      i += 1;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: 'question', value: '?', position: i });
      i += 1;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':', position: i });
      i += 1;
      continue;
    }

    // Multi-character operators (`===`, `!==`, `==`, `!=`, `<=`, `>=`, `&&`, `||`)
    const three = source.slice(i, i + 3);
    if (three === '===' || three === '!==') {
      tokens.push({
        type: 'operator',
        value: three === '===' ? '==' : '!=',
        position: i,
      });
      i += 3;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (
      two === '==' ||
      two === '!=' ||
      two === '<=' ||
      two === '>=' ||
      two === '&&' ||
      two === '||'
    ) {
      tokens.push({ type: 'operator', value: two, position: i });
      i += 2;
      continue;
    }

    // Single-character operators
    if (
      ch === '+' ||
      ch === '-' ||
      ch === '*' ||
      ch === '/' ||
      ch === '%' ||
      ch === '<' ||
      ch === '>' ||
      ch === '!'
    ) {
      tokens.push({ type: 'operator', value: ch, position: i });
      i += 1;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character "${ch}" in formula`, i);
  }

  tokens.push({ type: 'eof', value: '', position: source.length });
  return tokens;
}
