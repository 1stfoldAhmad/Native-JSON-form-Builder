import { compileFormSchema } from '../compiler/SchemaCompiler';
import type { FieldConfig, FormConfig, FormValues } from '../types';
import {
  SchemaVersionRegistry,
  type SchemaMigrationFn,
} from '../versioning/SchemaVersionRegistry';

export interface SubmissionMigrationStep {
  formId: string;
  fromVersion: string;
  toVersion: string;
  migrate: SchemaMigrationFn;
}

export type SchemaDiffKind =
  | 'fieldAdded'
  | 'fieldRemoved'
  | 'fieldTypeChanged'
  | 'newRequiredFieldWithoutDefault'
  | 'optionRemoved'
  | 'optionAdded'
  | 'defaultChanged';

export interface SchemaDiffChange {
  kind: SchemaDiffKind;
  path: string;
  breaking: boolean;
  description: string;
  before?: unknown;
  after?: unknown;
}

export interface SchemaDiffReport {
  fromVersion?: string;
  toVersion?: string;
  compatible: boolean;
  breakingChanges: SchemaDiffChange[];
  nonBreakingChanges: SchemaDiffChange[];
  allChanges: SchemaDiffChange[];
}

function extractOptionValues(field: FieldConfig): Set<string> {
  const out = new Set<string>();
  for (const opt of field.options ?? []) {
    const val = typeof opt === 'object' && opt !== null ? opt.value : opt;
    out.add(String(val));
  }
  return out;
}

function collectValueFieldMap(config: FormConfig): Map<string, FieldConfig> {
  const plan = compileFormSchema(config);
  const out = new Map<string, FieldConfig>();
  for (const [path, node] of plan.nodes.entries()) {
    out.set(path, node.field);
  }
  return out;
}

/**
 * Compares two `FormConfig` versions and classifies every structural delta as
 * breaking vs backward-compatible for saved drafts and queued offline submissions.
 */
export function diffFormSchemas(
  previous: FormConfig,
  next: FormConfig
): SchemaDiffReport {
  const prevMap = collectValueFieldMap(previous);
  const nextMap = collectValueFieldMap(next);
  const allChanges: SchemaDiffChange[] = [];

  for (const [path, prevField] of prevMap.entries()) {
    const nextField = nextMap.get(path);
    if (!nextField) {
      allChanges.push({
        kind: 'fieldRemoved',
        path,
        breaking: true,
        before: prevField.type,
        description: `Field "${path}" (${prevField.type}) was removed.`,
      });
      continue;
    }

    if (prevField.type !== nextField.type) {
      allChanges.push({
        kind: 'fieldTypeChanged',
        path,
        breaking: true,
        before: prevField.type,
        after: nextField.type,
        description: `Field "${path}" changed type from "${prevField.type}" to "${nextField.type}".`,
      });
    }

    const prevOpts = extractOptionValues(prevField);
    const nextOpts = extractOptionValues(nextField);
    for (const val of prevOpts) {
      if (!nextOpts.has(val)) {
        allChanges.push({
          kind: 'optionRemoved',
          path,
          breaking: true,
          before: val,
          description: `Option "${val}" was removed from field "${path}".`,
        });
      }
    }
    for (const val of nextOpts) {
      if (!prevOpts.has(val)) {
        allChanges.push({
          kind: 'optionAdded',
          path,
          breaking: false,
          after: val,
          description: `Option "${val}" was added to field "${path}".`,
        });
      }
    }

    const prevDefault = previous.defaults?.[path] ?? prevField.defaultValue;
    const nextDefault = next.defaults?.[path] ?? nextField.defaultValue;
    if (JSON.stringify(prevDefault) !== JSON.stringify(nextDefault)) {
      allChanges.push({
        kind: 'defaultChanged',
        path,
        breaking: false,
        before: prevDefault,
        after: nextDefault,
        description: `Default value for "${path}" changed.`,
      });
    }
  }

  for (const [path, nextField] of nextMap.entries()) {
    if (!prevMap.has(path)) {
      const isRequired =
        nextField.required === true || Boolean(nextField.validation?.required);
      const hasDefault =
        next.defaults?.[path] !== undefined || nextField.defaultValue !== undefined;
      if (isRequired && !hasDefault && !nextField.visibleWhen && !nextField.requiredWhen) {
        allChanges.push({
          kind: 'newRequiredFieldWithoutDefault',
          path,
          breaking: true,
          after: nextField.type,
          description: `New unconditionally required field "${path}" has no default value.`,
        });
      } else {
        allChanges.push({
          kind: 'fieldAdded',
          path,
          breaking: false,
          after: nextField.type,
          description: `Optional or defaulted field "${path}" (${nextField.type}) was added.`,
        });
      }
    }
  }

  const breakingChanges = allChanges.filter((c) => c.breaking);
  const nonBreakingChanges = allChanges.filter((c) => !c.breaking);

  return {
    fromVersion: previous.version,
    toVersion: next.version,
    compatible: breakingChanges.length === 0,
    breakingChanges,
    nonBreakingChanges,
    allChanges,
  };
}

/**
 * Verifies that registered migrations cleanly upgrade a sample payload from `fromVersion`
 * to `targetVersion` without missing hops or runtime errors.
 */
export function validateMigrationChain(params: {
  formId: string;
  fromVersion: string;
  targetVersion: string;
  migrations: SubmissionMigrationStep[];
  samplePayload: FormValues;
}): {
  valid: boolean;
  appliedSteps: string[];
  migratedValues?: FormValues;
  error?: string;
} {
  const registry = new SchemaVersionRegistry();
  for (const mig of params.migrations) {
    registry.registerMigration(mig);
  }
  const path = registry.findMigrationPath(
    params.formId,
    params.fromVersion,
    params.targetVersion
  );
  if (!path) {
    return {
      valid: false,
      appliedSteps: [],
      error: `No migration path from ${params.fromVersion} to ${params.targetVersion}`,
    };
  }
  try {
    const migratedValues = registry.migratePayload(
      params.formId,
      params.fromVersion,
      params.targetVersion,
      params.samplePayload
    );
    return {
      valid: true,
      appliedSteps: path.map((edge) => `${edge.fromVersion}->${edge.toVersion}`),
      migratedValues,
    };
  } catch (err) {
    return {
      valid: false,
      appliedSteps: [],
      error: err instanceof Error ? err.message : 'Migration failed',
    };
  }
}
