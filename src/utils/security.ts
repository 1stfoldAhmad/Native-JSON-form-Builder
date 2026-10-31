import type {
  FieldConfig,
  FormConfig,
  FormSecurityConfig,
  FormValues,
} from '../types';
import { deepClone, hasUnsafePathSegment, setByPath } from './deepPath';

/**
 * Built-in credential & card-secret field types that are UNCONDITIONALLY sensitive.
 * Setting `"sensitive": false` in a user or remote `form.json` cannot downgrade these types.
 */
export const BUILT_IN_SECRET_FIELD_TYPES: ReadonlySet<string> = new Set([
  'password',
  'newPassword',
  'confirmPassword',
  'pin',
  'otp',
  'cvv',
]);

export function isBuiltInSecretFieldType(type: string): boolean {
  return BUILT_IN_SECRET_FIELD_TYPES.has(type);
}

export function isSensitiveField(
  field: Pick<FieldConfig, 'name' | 'type' | 'sensitive'>,
  security?: FormSecurityConfig
): boolean {
  // 1. Built-in secret types (passwords, PINs, OTPs, CVVs) can NEVER opt out of protection
  if (BUILT_IN_SECRET_FIELD_TYPES.has(field.type)) return true;
  // 2. Form-level `security.sensitiveFields` policy cannot be overridden by field-level `false`
  if (field.name && security?.sensitiveFields?.includes(field.name)) return true;
  // 3. Explicit field-level opt-in for custom/general fields (e.g. CNIC, IBAN, SSN, tax ID)
  if (field.sensitive === true) return true;
  return false;
}

export function collectSensitiveFieldPaths(
  fieldsOrConfig: readonly FieldConfig[] | FormConfig,
  security?: FormSecurityConfig,
  prefix = '',
  options?: { builtInSecretsOnly?: boolean }
): Set<string> {
  if (!Array.isArray(fieldsOrConfig)) {
    const cfg = fieldsOrConfig as FormConfig;
    const sec = security ?? cfg.security;
    const combined = new Set<string>();
    for (const p of collectSensitiveFieldPaths(cfg.fields ?? [], sec, prefix, options)) {
      combined.add(p);
    }
    for (const section of cfg.sections ?? []) {
      const inline = section.fields.filter((f): f is FieldConfig => typeof f !== 'string');
      for (const p of collectSensitiveFieldPaths(inline, sec, prefix, options)) {
        combined.add(p);
      }
    }
    for (const step of cfg.steps ?? []) {
      for (const p of collectSensitiveFieldPaths(step.fields, sec, prefix, options)) {
        combined.add(p);
      }
    }
    if (!options?.builtInSecretsOnly) {
      for (const extra of sec?.sensitiveFields ?? []) {
        if (!hasUnsafePathSegment(extra)) combined.add(extra);
      }
    }
    return combined;
  }

  const fields = fieldsOrConfig;
  const paths = new Set<string>();
  for (const field of fields) {
    const fullPath = field.name ? (prefix ? `${prefix}.${field.name}` : field.name) : prefix;
    const matches = options?.builtInSecretsOnly
      ? BUILT_IN_SECRET_FIELD_TYPES.has(field.type)
      : isSensitiveField(field, security);
    if (field.name && matches && !hasUnsafePathSegment(fullPath)) {
      paths.add(fullPath);
    }
    if (field.fields?.length) {
      const nextPrefix =
        field.type === 'objectGroup' && field.name
          ? fullPath
          : field.type === 'repeater' && field.name
            ? `${fullPath}.*`
            : prefix;
      for (const nested of collectSensitiveFieldPaths(
        field.fields,
        security,
        nextPrefix,
        options
      )) {
        paths.add(nested);
      }
    }
    if (field.steps?.length) {
      for (const step of field.steps) {
        for (const nested of collectSensitiveFieldPaths(
          step.fields,
          security,
          prefix,
          options
        )) {
          paths.add(nested);
        }
      }
    }
  }
  if (!options?.builtInSecretsOnly) {
    for (const extra of security?.sensitiveFields ?? []) {
      if (!hasUnsafePathSegment(extra)) paths.add(extra);
    }
  }
  return paths;
}

function applyAtWildcardPath(
  current: unknown,
  segments: readonly string[],
  mode: 'omit' | 'redact'
): unknown {
  if (current == null || typeof current !== 'object' || segments.length === 0) {
    return current;
  }
  const [head, ...rest] = segments;

  if (head === '*') {
    if (!Array.isArray(current)) return current;
    return current.map((item) => applyAtWildcardPath(item, rest, mode));
  }

  if (Array.isArray(current)) {
    const idx = Number(head);
    if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return current;
    const copy = [...current];
    if (rest.length === 0) {
      copy[idx] = mode === 'redact' ? '[REDACTED]' : undefined;
    } else {
      copy[idx] = applyAtWildcardPath(copy[idx], rest, mode);
    }
    return copy;
  }

  const obj = current as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, head)) {
    return mode === 'redact' && rest.length === 0 ? { ...obj, [head]: '[REDACTED]' } : current;
  }

  const copy: Record<string, unknown> = { ...obj };
  if (rest.length === 0) {
    if (mode === 'omit') {
      delete copy[head];
    } else {
      copy[head] = '[REDACTED]';
    }
  } else {
    copy[head] = applyAtWildcardPath(copy[head], rest, mode);
  }
  return copy;
}

/**
 * Redacts or omits sensitive fields before draft persistence or diagnostic inspection.
 * Supports top-level fields, nested `objectGroup` paths, and `repeater` wildcard paths (`items.*.cvv`).
 * Guarantees passwords/PINs/OTPs/CVVs are never persisted or logged.
 */
export function omitSensitiveValues(
  values: FormValues,
  sensitivePaths: ReadonlySet<string>
): FormValues {
  let result: FormValues = deepClone(values);
  for (const path of sensitivePaths) {
    if (hasUnsafePathSegment(path)) continue;
    if (path.includes('*') || path.includes('.')) {
      result = applyAtWildcardPath(result, path.split('.').filter(Boolean), 'omit') as FormValues;
    } else if (Object.prototype.hasOwnProperty.call(result, path)) {
      delete result[path];
    }
  }
  return result;
}

export function redactSensitiveForLog(
  values: FormValues,
  sensitivePaths: ReadonlySet<string>
): FormValues {
  let result: FormValues = deepClone(values);
  for (const path of sensitivePaths) {
    if (hasUnsafePathSegment(path)) continue;
    if (path.includes('*')) {
      result = applyAtWildcardPath(result, path.split('.').filter(Boolean), 'redact') as FormValues;
    } else {
      result = setByPath(result, path, '[REDACTED]');
    }
  }
  return result;
}
