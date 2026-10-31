import type { FieldConfig, FieldOption, FormConfig } from '../types';

export interface TypeGeneratorOptions {
  /** Override generated interface name (defaults to `<PascalFormId>Values`). */
  interfaceName?: string;
  /** Include `import type { FormFileAsset } from 'native-json-form-builder'` when upload fields exist. */
  includeImports?: boolean;
}

const NON_VALUE_TYPES = new Set([
  'heading',
  'description',
  'staticText',
  'divider',
  'section',
  'fieldGroup',
  'conditionalGroup',
  'stepGroup',
]);

const NUMERIC_TYPES = new Set([
  'number',
  'integer',
  'decimal',
  'currency',
  'percentage',
  'age',
  'quantity',
  'price',
  'phoneExtension',
  'slider',
  'rating',
  'year',
  'duration',
]);

const BOOLEAN_TYPES = new Set(['checkbox', 'switch']);

const ARRAY_SELECTION_TYPES = new Set([
  'checkboxGroup',
  'multiSelect',
  'searchableMultiSelect',
  'chips',
  'tagInput',
]);

const SINGLE_UPLOAD_TYPES = new Set([
  'image',
  'camera',
  'avatar',
  'video',
  'audio',
  'document',
  'documentScan',
  'pdf',
  'file',
  'signature',
]);

const MULTI_UPLOAD_TYPES = new Set(['multipleFiles', 'multipleImages']);

function toPascalCase(id: string): string {
  const cleaned = id
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join('');
  return cleaned ? (/^[0-9]/.test(cleaned) ? `Form${cleaned}` : cleaned) : 'GeneratedForm';
}

function formatPropertyKey(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function optionLiteralUnion(
  options?: readonly (FieldOption | string | number)[]
): string | null {
  if (!options || options.length === 0) return null;
  const literals = options.map((opt) => {
    const val = typeof opt === 'object' && opt !== null ? opt.value : opt;
    return JSON.stringify(val);
  });
  return Array.from(new Set(literals)).join(' | ');
}

function collectRootFields(config: FormConfig): FieldConfig[] {
  const byName = new Map<string, FieldConfig>();
  for (const f of config.fields ?? []) {
    if (f.name) byName.set(f.name, f);
  }
  const out: FieldConfig[] = [];
  if (config.fields) out.push(...config.fields);
  for (const sec of config.sections ?? []) {
    for (const item of sec.fields) {
      if (typeof item === 'string') {
        const ref = byName.get(item);
        if (ref && !out.includes(ref)) out.push(ref);
      } else {
        out.push(item);
      }
    }
  }
  for (const step of config.steps ?? []) {
    out.push(...step.fields);
  }
  return out;
}

function inferFieldTsType(
  field: FieldConfig,
  indent: string,
  state: { usesFileAsset: boolean }
): string {
  const t = field.type;

  if (t === 'objectGroup') {
    const inner = renderFieldProperties(field.fields ?? [], `${indent}  `, state);
    return inner ? `{\n${inner}\n${indent}}` : 'Record<string, unknown>';
  }

  if (t === 'repeater' || t === 'arrayGroup') {
    const inner = renderFieldProperties(field.fields ?? [], `${indent}  `, state);
    return inner ? `Array<{\n${inner}\n${indent}}>` : 'Array<Record<string, unknown>>';
  }

  if (NUMERIC_TYPES.has(t)) return 'number';
  if (t === 'rangeSlider') return '[number, number]';
  if (BOOLEAN_TYPES.has(t)) return 'boolean';

  if (ARRAY_SELECTION_TYPES.has(t)) {
    const union = optionLiteralUnion(field.options);
    return union ? `Array<${union}>` : 'string[]';
  }

  if (
    t === 'select' ||
    t === 'searchableSelect' ||
    t === 'radioGroup' ||
    t === 'segmentedControl'
  ) {
    return optionLiteralUnion(field.options) ?? 'string';
  }

  if (t === 'coordinates') {
    return '{ latitude?: number; longitude?: number }';
  }

  if (t === 'dateRange') {
    return '{ start?: string; end?: string }';
  }

  if (t === 'address') {
    return '{ line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }';
  }

  if (SINGLE_UPLOAD_TYPES.has(t)) {
    state.usesFileAsset = true;
    return 'FormFileAsset | null';
  }

  if (MULTI_UPLOAD_TYPES.has(t)) {
    state.usesFileAsset = true;
    return 'FormFileAsset[]';
  }

  if (t === 'calculated' || t === 'computed') {
    return 'string | number | boolean';
  }

  return 'string';
}

function flattenStructuralSiblings(fields: readonly FieldConfig[]): FieldConfig[] {
  const out: FieldConfig[] = [];
  for (const f of fields) {
    if (f.type === 'section' || f.type === 'fieldGroup' || f.type === 'conditionalGroup') {
      if (f.fields) out.push(...flattenStructuralSiblings(f.fields));
      continue;
    }
    if (f.type === 'stepGroup' && f.steps) {
      for (const s of f.steps) {
        out.push(...flattenStructuralSiblings(s.fields));
      }
      continue;
    }
    if (!NON_VALUE_TYPES.has(f.type) && f.name) {
      out.push(f);
    }
  }
  return out;
}

function isUnconditionallyRequired(field: FieldConfig): boolean {
  const hasExplicitRequired =
    field.required === true || Boolean(field.validation?.required);
  if (!hasExplicitRequired) return false;
  if (field.visibleWhen || field.hiddenWhen || field.requiredWhen || field.hidden) {
    return false;
  }
  return true;
}

function renderFieldProperties(
  fields: readonly FieldConfig[],
  indent: string,
  state: { usesFileAsset: boolean }
): string {
  const flat = flattenStructuralSiblings(fields);
  const seen = new Set<string>();
  return flat
    .filter((f) => {
      if (!f.name || seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    })
    .map((f) => {
      const propKey = formatPropertyKey(f.name!);
      const optionalFlag = isUnconditionallyRequired(f) ? '' : '?';
      const tsType = inferFieldTsType(f, indent, state);
      return `${indent}${propKey}${optionalFlag}: ${tsType};`;
    })
    .join('\n');
}

/**
 * Generates strongly-typed TypeScript interfaces directly from any `FormConfig` JSON schema.
 */
export function generateFormValuesTypeScript(
  config: FormConfig,
  options?: TypeGeneratorOptions
): string {
  const ifaceName = options?.interfaceName ?? `${toPascalCase(config.id)}Values`;
  const state = { usesFileAsset: false };
  const topFields = collectRootFields(config);
  const body = renderFieldProperties(topFields, '  ', state);

  const lines: string[] = [];
  if ((options?.includeImports ?? true) && state.usesFileAsset) {
    lines.push("import type { FormFileAsset } from 'native-json-form-builder';", '');
  }
  lines.push(`export interface ${ifaceName} {`);
  if (body) lines.push(body);
  lines.push('}');
  return lines.join('\n');
}
