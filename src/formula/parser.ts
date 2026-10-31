import {
  FormulaSyntaxError,
  tokenizeFormula,
  type FormulaToken,
} from './tokenizer';

export const MAX_FORMULA_AST_DEPTH = 32;
const COMPILED_FORMULA_CACHE_LIMIT = 256;

export type BinaryFormulaOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||';

export type UnaryFormulaOperator = '-' | '+' | '!';

export type FormulaASTNode =
  | { kind: 'literal'; value: number | string | boolean | null }
  | { kind: 'field'; path: string }
  | { kind: 'unary'; operator: UnaryFormulaOperator; operand: FormulaASTNode }
  | {
      kind: 'binary';
      operator: BinaryFormulaOperator;
      left: FormulaASTNode;
      right: FormulaASTNode;
    }
  | {
      kind: 'conditional';
      test: FormulaASTNode;
      consequent: FormulaASTNode;
      alternate: FormulaASTNode;
    }
  | { kind: 'call'; callee: string; args: readonly FormulaASTNode[] };

export interface FormulaParseResult {
  valid: boolean;
  ast?: FormulaASTNode;
  dependencies: string[];
  functionCalls: string[];
  error?: string;
  errorPosition?: number;
}

const compiledFormulaCache = new Map<string, FormulaParseResult>();

class RecursiveDescentParser {
  private readonly tokens: readonly FormulaToken[];
  private pos = 0;

  constructor(tokens: readonly FormulaToken[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): FormulaToken {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private consume(): FormulaToken {
    const tok = this.peek();
    this.pos += 1;
    return tok;
  }

  private expect(type: FormulaToken['type'], label: string): FormulaToken {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new FormulaSyntaxError(
        `Expected ${label}, found "${tok.value || tok.type}"`,
        tok.position
      );
    }
    return this.consume();
  }

  public parseRoot(): FormulaASTNode {
    if (this.peek().type === 'eof') {
      throw new FormulaSyntaxError('Formula expression cannot be empty', 0);
    }
    const expr = this.parseConditional(0);
    const trailing = this.peek();
    if (trailing.type !== 'eof') {
      throw new FormulaSyntaxError(
        `Unexpected token "${trailing.value}"`,
        trailing.position
      );
    }
    return expr;
  }

  private checkDepth(depth: number, pos: number): void {
    if (depth > MAX_FORMULA_AST_DEPTH) {
      throw new FormulaSyntaxError(
        `Formula exceeds maximum nesting depth of ${MAX_FORMULA_AST_DEPTH}`,
        pos
      );
    }
  }

  private parseConditional(depth: number): FormulaASTNode {
    this.checkDepth(depth, this.peek().position);
    const test = this.parseLogicalOr(depth);
    if (this.peek().type === 'question') {
      this.consume();
      const consequent = this.parseConditional(depth + 1);
      this.expect('colon', '":" in ternary conditional expression');
      const alternate = this.parseConditional(depth + 1);
      return { kind: 'conditional', test, consequent, alternate };
    }
    return test;
  }

  private parseLogicalOr(depth: number): FormulaASTNode {
    let left = this.parseLogicalAnd(depth);
    while (this.peek().type === 'operator' && this.peek().value === '||') {
      this.consume();
      const right = this.parseLogicalAnd(depth);
      left = { kind: 'binary', operator: '||', left, right };
    }
    return left;
  }

  private parseLogicalAnd(depth: number): FormulaASTNode {
    let left = this.parseEquality(depth);
    while (this.peek().type === 'operator' && this.peek().value === '&&') {
      this.consume();
      const right = this.parseEquality(depth);
      left = { kind: 'binary', operator: '&&', left, right };
    }
    return left;
  }

  private parseEquality(depth: number): FormulaASTNode {
    let left = this.parseComparison(depth);
    while (
      this.peek().type === 'operator' &&
      (this.peek().value === '==' || this.peek().value === '!=')
    ) {
      const op = this.consume().value as '==' | '!=';
      const right = this.parseComparison(depth);
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseComparison(depth: number): FormulaASTNode {
    let left = this.parseAdditive(depth);
    while (
      this.peek().type === 'operator' &&
      (this.peek().value === '<' ||
        this.peek().value === '<=' ||
        this.peek().value === '>' ||
        this.peek().value === '>=')
    ) {
      const op = this.consume().value as '<' | '<=' | '>' | '>=';
      const right = this.parseAdditive(depth);
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseAdditive(depth: number): FormulaASTNode {
    let left = this.parseMultiplicative(depth);
    while (
      this.peek().type === 'operator' &&
      (this.peek().value === '+' || this.peek().value === '-')
    ) {
      const op = this.consume().value as '+' | '-';
      const right = this.parseMultiplicative(depth);
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseMultiplicative(depth: number): FormulaASTNode {
    let left = this.parseUnary(depth);
    while (
      this.peek().type === 'operator' &&
      (this.peek().value === '*' ||
        this.peek().value === '/' ||
        this.peek().value === '%')
    ) {
      const op = this.consume().value as '*' | '/' | '%';
      const right = this.parseUnary(depth);
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseUnary(depth: number): FormulaASTNode {
    this.checkDepth(depth, this.peek().position);
    const tok = this.peek();
    if (
      tok.type === 'operator' &&
      (tok.value === '-' || tok.value === '+' || tok.value === '!')
    ) {
      const op = this.consume().value as UnaryFormulaOperator;
      const operand = this.parseUnary(depth + 1);
      return { kind: 'unary', operator: op, operand };
    }
    return this.parsePrimary(depth);
  }

  private parsePrimary(depth: number): FormulaASTNode {
    this.checkDepth(depth, this.peek().position);
    const tok = this.peek();

    if (tok.type === 'number') {
      this.consume();
      return { kind: 'literal', value: Number(tok.value) };
    }
    if (tok.type === 'string') {
      this.consume();
      return { kind: 'literal', value: tok.value };
    }
    if (tok.type === 'boolean') {
      this.consume();
      return { kind: 'literal', value: tok.value === 'true' };
    }
    if (tok.type === 'null') {
      this.consume();
      return { kind: 'literal', value: null };
    }

    if (tok.type === 'lparen') {
      this.consume();
      const inner = this.parseConditional(depth + 1);
      this.expect('rparen', 'closing ")"');
      return inner;
    }

    if (tok.type === 'identifier') {
      this.consume();
      if (this.peek().type === 'lparen') {
        this.consume();
        const args: FormulaASTNode[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.parseConditional(depth + 1));
          while (this.peek().type === 'comma') {
            this.consume();
            args.push(this.parseConditional(depth + 1));
          }
        }
        this.expect('rparen', 'closing ")" after function arguments');
        return { kind: 'call', callee: tok.value.toUpperCase(), args };
      }
      return { kind: 'field', path: tok.value };
    }

    throw new FormulaSyntaxError(
      `Unexpected token "${tok.value || tok.type}"`,
      tok.position
    );
  }
}

/**
 * Extracts referenced field paths and function names from a parsed `FormulaASTNode`.
 * Normalizes `$item.<subField>` into `<repeaterTemplatePrefix>.<subField>` when inside a repeater.
 */
export function inspectFormulaAST(
  ast: FormulaASTNode,
  repeaterTemplatePrefix?: string
): { dependencies: string[]; functionCalls: string[] } {
  const deps = new Set<string>();
  const fns = new Set<string>();

  const visit = (node: FormulaASTNode) => {
    switch (node.kind) {
      case 'literal':
        break;
      case 'field': {
        if (node.path === '$index') break;
        if (node.path.startsWith('$item.')) {
          const sub = node.path.slice('$item.'.length);
          deps.add(repeaterTemplatePrefix ? `${repeaterTemplatePrefix}.${sub}` : sub);
        } else if (node.path.startsWith('$parent.')) {
          deps.add(node.path.slice('$parent.'.length));
        } else {
          deps.add(node.path);
          // Also depend on the repeater array root when referencing `items.*.amount`
          const wildcardIdx = node.path.indexOf('.*');
          if (wildcardIdx > 0) {
            deps.add(node.path.slice(0, wildcardIdx));
          }
        }
        break;
      }
      case 'unary':
        visit(node.operand);
        break;
      case 'binary':
        visit(node.left);
        visit(node.right);
        break;
      case 'conditional':
        visit(node.test);
        visit(node.consequent);
        visit(node.alternate);
        break;
      case 'call':
        fns.add(node.callee);
        for (const arg of node.args) visit(arg);
        break;
    }
  };

  visit(ast);
  return {
    dependencies: Array.from(deps),
    functionCalls: Array.from(fns),
  };
}

/**
 * Parses and caches a restricted formula expression into an immutable `FormulaASTNode`.
 */
export function parseFormula(
  expression: string,
  options?: { repeaterTemplatePrefix?: string; bypassCache?: boolean }
): FormulaParseResult {
  const cacheKey = `${options?.repeaterTemplatePrefix ?? ''}::${expression}`;
  if (!options?.bypassCache) {
    const cached = compiledFormulaCache.get(cacheKey);
    if (cached) return cached;
  }

  let result: FormulaParseResult;
  try {
    const tokens = tokenizeFormula(expression);
    const parser = new RecursiveDescentParser(tokens);
    const ast = parser.parseRoot();
    const { dependencies, functionCalls } = inspectFormulaAST(
      ast,
      options?.repeaterTemplatePrefix
    );
    result = {
      valid: true,
      ast,
      dependencies,
      functionCalls,
    };
  } catch (err) {
    if (err instanceof FormulaSyntaxError) {
      result = {
        valid: false,
        dependencies: [],
        functionCalls: [],
        error: err.message,
        errorPosition: err.position,
      };
    } else {
      result = {
        valid: false,
        dependencies: [],
        functionCalls: [],
        error: err instanceof Error ? err.message : 'Invalid formula expression',
      };
    }
  }

  if (!options?.bypassCache) {
    if (compiledFormulaCache.size >= COMPILED_FORMULA_CACHE_LIMIT) {
      const oldest = compiledFormulaCache.keys().next().value;
      if (oldest !== undefined) compiledFormulaCache.delete(oldest);
    }
    compiledFormulaCache.set(cacheKey, result);
  }

  return result;
}

export function clearCompiledFormulaCache(): void {
  compiledFormulaCache.clear();
}
