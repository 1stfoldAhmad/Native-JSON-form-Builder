import { calculateAgeInYears } from '../utils/formatting';

export type PureFormulaFunction = (
  args: readonly unknown[],
  context: { now: () => Date }
) => unknown;

export interface FormulaFunctionMeta {
  minArgs?: number;
  maxArgs?: number;
  description?: string;
}

interface RegisteredFunctionEntry {
  fn: PureFormulaFunction;
  meta?: FormulaFunctionMeta;
}

export function toFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === 'boolean') {
    return val ? 1 : 0;
  }
  if (val === null || val === undefined || val === '') {
    return fallback;
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function flattenNumbers(args: readonly unknown[]): number[] {
  const nums: number[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      for (const el of item) visit(el);
    } else if (item !== null && item !== undefined && item !== '') {
      const n = Number(item);
      if (Number.isFinite(n)) nums.push(n);
    }
  };
  for (const a of args) visit(a);
  return nums;
}

function roundToPrecision(value: number, precision = 0): number {
  const digits = Math.max(0, Math.min(12, Math.trunc(toFiniteNumber(precision, 0))));
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseIsoDateMs(val: unknown): number | null {
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.getTime();
  }
  if (typeof val !== 'string' || !val.trim()) return null;
  const ms = Date.parse(val);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Registry of pure, side-effect-free functions callable inside JSON formulas.
 */
export class FormulaFunctionRegistry {
  private entries = new Map<string, RegisteredFunctionEntry>();

  constructor(seedDefaults = true) {
    if (seedDefaults) {
      this.registerBuiltIns();
    }
  }

  public register(
    name: string,
    fn: PureFormulaFunction,
    meta?: FormulaFunctionMeta
  ): () => void {
    const key = name.trim().toUpperCase();
    this.entries.set(key, { fn, meta });
    return () => {
      this.entries.delete(key);
    };
  }

  public has(name: string): boolean {
    return this.entries.has(name.trim().toUpperCase());
  }

  public get(name: string): RegisteredFunctionEntry | undefined {
    return this.entries.get(name.trim().toUpperCase());
  }

  public listNames(): string[] {
    return Array.from(this.entries.keys()).sort();
  }

  private registerBuiltIns(): void {
    // Arithmetic & rounding
    this.register('ROUND', ([val, decimals]) =>
      roundToPrecision(toFiniteNumber(val), toFiniteNumber(decimals, 0))
    );
    this.register('FLOOR', ([val]) => Math.floor(toFiniteNumber(val)));
    this.register('CEIL', ([val]) => Math.ceil(toFiniteNumber(val)));
    this.register('ABS', ([val]) => Math.abs(toFiniteNumber(val)));
    this.register('CLAMP', ([val, min, max]) => {
      const n = toFiniteNumber(val);
      const lo = toFiniteNumber(min);
      const hi = toFiniteNumber(max);
      return Math.min(hi, Math.max(lo, n));
    });
    this.register('POW', ([base, exp]) => {
      const res = Math.pow(toFiniteNumber(base), toFiniteNumber(exp));
      return Number.isFinite(res) ? res : 0;
    });

    // Percentage, tax & discount helpers
    this.register('PCT', ([amount, rate]) =>
      (toFiniteNumber(amount) * toFiniteNumber(rate)) / 100
    );
    this.register('TAX', ([amount, rate]) =>
      (toFiniteNumber(amount) * toFiniteNumber(rate)) / 100
    );
    this.register('ADD_TAX', ([amount, rate]) => {
      const base = toFiniteNumber(amount);
      return base + (base * toFiniteNumber(rate)) / 100;
    });
    this.register('DISCOUNT', ([amount, rate]) => {
      const base = toFiniteNumber(amount);
      return base - (base * toFiniteNumber(rate)) / 100;
    });

    // Array & scalar aggregations
    this.register('SUM', (args) =>
      flattenNumbers(args).reduce((acc, v) => acc + v, 0)
    );
    const avgFn: PureFormulaFunction = (args) => {
      const nums = flattenNumbers(args);
      if (nums.length === 0) return 0;
      return nums.reduce((acc, v) => acc + v, 0) / nums.length;
    };
    this.register('AVG', avgFn);
    this.register('AVERAGE', avgFn);
    this.register('MIN', (args) => {
      const nums = flattenNumbers(args);
      return nums.length === 0 ? 0 : Math.min(...nums);
    });
    this.register('MAX', (args) => {
      const nums = flattenNumbers(args);
      return nums.length === 0 ? 0 : Math.max(...nums);
    });
    this.register('COUNT', ([target, ...rest]) => {
      if (rest.length > 0) return 1 + rest.length;
      if (Array.isArray(target)) {
        return target.filter((v) => v !== null && v !== undefined && v !== '').length;
      }
      if (target === null || target === undefined || target === '') return 0;
      return 1;
    });

    // Conditional & null-coalescing
    this.register('IF', ([cond, thenVal, elseVal]) =>
      Boolean(cond) ? thenVal : (elseVal ?? null)
    );
    this.register('COALESCE', (args) => {
      for (const a of args) {
        if (a !== null && a !== undefined && a !== '') return a;
      }
      return null;
    });
    this.register('IS_EMPTY', ([val]) => {
      if (val === null || val === undefined || val === '') return true;
      if (Array.isArray(val)) return val.length === 0;
      return false;
    });

    // String operations
    this.register('CONCAT', (args) =>
      args
        .flatMap((a) => (Array.isArray(a) ? a : [a]))
        .filter((v) => v !== null && v !== undefined)
        .map(String)
        .join('')
    );
    this.register('UPPER', ([val]) => String(val ?? '').toUpperCase());
    this.register('LOWER', ([val]) => String(val ?? '').toLowerCase());
    this.register('TRIM', ([val]) => String(val ?? '').trim());
    this.register('LEN', ([val]) => {
      if (Array.isArray(val)) return val.length;
      return String(val ?? '').length;
    });
    this.register('CONTAINS', ([haystack, needle]) => {
      if (Array.isArray(haystack)) return haystack.includes(needle);
      return String(haystack ?? '').includes(String(needle ?? ''));
    });
    this.register('STARTS_WITH', ([str, prefix]) =>
      String(str ?? '').startsWith(String(prefix ?? ''))
    );
    this.register('ENDS_WITH', ([str, suffix]) =>
      String(str ?? '').endsWith(String(suffix ?? ''))
    );

    // Date & time operations
    this.register('TODAY', (_args, ctx) => ctx.now().toISOString().slice(0, 10));
    this.register('AGE', ([dob, refDate], ctx) => {
      if (!dob || (typeof dob !== 'string' && !(dob instanceof Date))) return 0;
      const ref =
        typeof refDate === 'string' && refDate
          ? new Date(refDate)
          : refDate instanceof Date
            ? refDate
            : ctx.now();
      return calculateAgeInYears(dob, ref) ?? 0;
    });
    this.register('DAYS_BETWEEN', ([startIso, endIso]) => {
      const startMs = parseIsoDateMs(startIso);
      const endMs = parseIsoDateMs(endIso);
      if (startMs === null || endMs === null) return 0;
      return Math.round((endMs - startMs) / 86_400_000);
    });
    this.register('ADD_DAYS', ([isoDate, days]) => {
      const baseMs = parseIsoDateMs(isoDate);
      if (baseMs === null) return '';
      const next = new Date(baseMs + toFiniteNumber(days, 0) * 86_400_000);
      return next.toISOString().slice(0, 10);
    });
    this.register('YEAR', ([isoDate]) => {
      const ms = parseIsoDateMs(isoDate);
      return ms === null ? 0 : new Date(ms).getUTCFullYear();
    });
  }
}

export const defaultFormulaFunctionRegistry = new FormulaFunctionRegistry(true);
