import type {
  FieldConfig,
  FormConfig,
  FormSecurityConfig,
  FormValues,
} from '../types';
import { deepClone, setByPath } from './deepPath';

const SENSITIVE_FIELD_TYPES = new Set(['password', 'confirmPassword', 'pin', 'otp']);

export function isSensitiveField(
  field: Pick<FieldConfig, 'name' | 'type' | 'sensitive'>,
  security?: FormSecurityConfig
): boolean {
  if (field.sensitive === true) return true;
  if (field.sensitive === false) return false;
  if (SENSITIVE_FIELD_TYPES.has(field.type)) return true;
  if (field.name && security?.sensitiveFields?.includes(field.name)) return true;
  return false;
}

export function collectSensitiveFieldPaths(
  fieldsOrConfig: readonly FieldConfig[] | FormConfig,
  security?: FormSecurityConfig,
  prefix = ''
): Set<string> {
  if (!Array.isArray(fieldsOrConfig)) {
    const cfg = fieldsOrConfig as FormConfig;
    const sec = security ?? cfg.security;
    const combined = new Set<string>();
    for (const p of collectSensitiveFieldPaths(cfg.fields ?? [], sec, prefix)) {
      combined.add(p);
    }
    for (const section of cfg.sections ?? []) {
      const inline = section.fields.filter((f): f is FieldConfig => typeof f !== 'string');
      for (const p of collectSensitiveFieldPaths(inline, sec, prefix)) {
        combined.add(p);
      }
    }
    for (const step of cfg.steps ?? []) {
      for (const p of collectSensitiveFieldPaths(step.fields, sec, prefix)) {
        combined.add(p);
      }
    }
    for (const extra of sec?.sensitiveFields ?? []) {
      combined.add(extra);
    }
    return combined;
  }

  const fields = fieldsOrConfig;
  const paths = new Set<string>();
  for (const field of fields) {
    const fullPath = field.name ? (prefix ? `${prefix}.${field.name}` : field.name) : prefix;
    if (field.name && isSensitiveField(field, security)) {
      paths.add(fullPath);
    }
    if (field.fields?.length) {
      const nextPrefix =
        field.type === 'objectGroup' && field.name ? fullPath : prefix;
      for (const nested of collectSensitiveFieldPaths(field.fields, security, nextPrefix)) {
        paths.add(nested);
      }
    }
    if (field.steps?.length) {
      for (const step of field.steps) {
        for (const nested of collectSensitiveFieldPaths(step.fields, security, prefix)) {
          paths.add(nested);
        }
      }
    }
  }
  for (const extra of security?.sensitiveFields ?? []) {
    paths.add(extra);
  }
  return paths;
}

/**
 * Redacts or omits sensitive fields before draft persistence or diagnostic inspection.
 * Guarantees passwords/PINs/OTPs are never persisted or logged.
 */
export function omitSensitiveValues(
  values: FormValues,
  sensitivePaths: ReadonlySet<string>
): FormValues {
  let result = deepClone(values);
  for (const path of sensitivePaths) {
    if (path.includes('.')) {
      result = setByPath(result, path, undefined);
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
  let result = deepClone(values);
  for (const path of sensitivePaths) {
    result = setByPath(result, path, '[REDACTED]');
  }
  return result;
}
