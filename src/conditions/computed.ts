import type {
  ComputedCalculator,
  ComputedFieldFormula,
  FieldConfig,
  FormValues,
} from '../types';
import { getByPath } from '../utils/deepPath';
import { calculateAgeInYears } from '../utils/formatting';
import { evaluateCondition } from './evaluator';

export function evaluateComputedField(
  fieldOrFormula: FieldConfig | ComputedFieldFormula,
  values: FormValues,
  calculators?: Record<string, ComputedCalculator>
): unknown {
  const formula =
    'operation' in fieldOrFormula ? fieldOrFormula : fieldOrFormula.computed;
  if (!formula) return undefined;

  if (formula.calculatorId && calculators?.[formula.calculatorId]) {
    const asField: FieldConfig =
      'operation' in fieldOrFormula
        ? { type: 'computed', computed: fieldOrFormula }
        : fieldOrFormula;
    return calculators[formula.calculatorId](values, asField);
  }

  const round = (n: number): number => {
    if (formula.precision === undefined) return n;
    const factor = 10 ** formula.precision;
    return Math.round(n * factor) / factor;
  };

  const sourceValues = (formula.fields ?? []).map((p) => getByPath(values, p));
  const numericValues = sourceValues.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });

  switch (formula.operation) {
    case 'template': {
      const tpl = formula.template ?? '';
      return tpl.replace(/\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g, (_, path: string) => {
        const val = getByPath(values, path);
        return val === null || val === undefined ? '' : String(val);
      });
    }
    case 'concat': {
      const sep = formula.separator ?? ' ';
      return sourceValues
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(String)
        .join(sep);
    }
    case 'sum': {
      return round(numericValues.reduce((acc, v) => acc + v, 0));
    }
    case 'subtract': {
      if (numericValues.length === 0) return 0;
      const [first, ...rest] = numericValues;
      return round(rest.reduce((acc, v) => acc - v, first));
    }
    case 'multiply': {
      if (numericValues.length === 0) return 0;
      return round(numericValues.reduce((acc, v) => acc * v, 1));
    }
    case 'divide': {
      if (numericValues.length < 2) return numericValues[0] ?? 0;
      const [numerator, denominator] = numericValues;
      if (denominator === 0) return 0;
      return round(numerator / denominator);
    }
    case 'ageFromDate': {
      const dobField = formula.fields?.[0];
      const dob = dobField ? getByPath(values, dobField) : undefined;
      if (!dob || (typeof dob !== 'string' && !(dob instanceof Date))) return undefined;
      return calculateAgeInYears(dob) ?? undefined;
    }
    case 'count': {
      const target = sourceValues[0];
      if (Array.isArray(target)) return target.length;
      if (typeof target === 'string') return target.length;
      return 0;
    }
    case 'conditional': {
      return evaluateCondition(formula.when, values) ? formula.thenValue : formula.elseValue;
    }
    default:
      return undefined;
  }
}
