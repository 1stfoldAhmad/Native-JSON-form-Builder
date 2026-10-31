import type { FormConfig, FormValues } from '../types';
import { deepClone } from '../utils/deepPath';

export type SchemaMigrationFn = (
  payload: FormValues,
  meta: { formId: string; fromVersion: string; toVersion: string }
) => FormValues;

interface MigrationEdge {
  fromVersion: string;
  toVersion: string;
  migrate: SchemaMigrationFn;
}

export function parseSemverTuple(version: string): [number, number, number] | null {
  const clean = version.trim().replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.');
  if (parts.length < 2 || parts.length > 3) return null;
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = parts[2] !== undefined ? Number(parts[2]) : 0;
  if ([major, minor, patch].some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  return [major, minor, patch];
}

export function compareSemver(a: string, b: string): number {
  const ta = parseSemverTuple(a);
  const tb = parseSemverTuple(b);
  if (!ta || !tb) return a.localeCompare(b);
  if (ta[0] !== tb[0]) return ta[0] - tb[0];
  if (ta[1] !== tb[1]) return ta[1] - tb[1];
  return ta[2] - tb[2];
}

export function isEngineVersionCompatible(
  engineVersion: string,
  minRequiredVersion?: string
): boolean {
  if (!minRequiredVersion) return true;
  return compareSemver(engineVersion, minRequiredVersion) >= 0;
}

/**
 * Registry of historical `FormConfig` versions and deterministic step-by-step
 * payload migrations (`1.0.0 -> 1.1.0 -> 2.0.0`) so older saved drafts and
 * archived submissions remain loadable across schema upgrades.
 */
export class SchemaVersionRegistry {
  private schemas = new Map<string, Map<string, FormConfig>>();
  private migrations = new Map<string, MigrationEdge[]>();

  public registerSchema(config: FormConfig, versionOverride?: string): void {
    const version = versionOverride ?? config.version ?? '1.0.0';
    if (!this.schemas.has(config.id)) {
      this.schemas.set(config.id, new Map());
    }
    this.schemas.get(config.id)!.set(version, config);
  }

  public getSchema(formId: string, version: string): FormConfig | undefined {
    return this.schemas.get(formId)?.get(version);
  }

  public listVersions(formId: string): string[] {
    const map = this.schemas.get(formId);
    if (!map) return [];
    return Array.from(map.keys()).sort(compareSemver);
  }

  public registerMigration(input: {
    formId: string;
    fromVersion: string;
    toVersion: string;
    migrate: SchemaMigrationFn;
  }): void {
    if (!this.migrations.has(input.formId)) {
      this.migrations.set(input.formId, []);
    }
    this.migrations.get(input.formId)!.push({
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      migrate: input.migrate,
    });
  }

  public findMigrationPath(
    formId: string,
    fromVersion: string,
    toVersion: string
  ): MigrationEdge[] | null {
    if (fromVersion === toVersion) return [];
    const edges = this.migrations.get(formId) ?? [];
    if (edges.length === 0) return null;

    // Breadth-first search for shortest migration chain `fromVersion -> ... -> toVersion`
    const queue: Array<{ version: string; path: MigrationEdge[] }> = [
      { version: fromVersion, path: [] },
    ];
    const visited = new Set<string>([fromVersion]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        if (edge.fromVersion !== current.version) continue;
        const nextPath = [...current.path, edge];
        if (edge.toVersion === toVersion) {
          return nextPath;
        }
        if (!visited.has(edge.toVersion)) {
          visited.add(edge.toVersion);
          queue.push({ version: edge.toVersion, path: nextPath });
        }
      }
    }

    return null;
  }

  public canMigrate(formId: string, fromVersion: string, toVersion: string): boolean {
    return this.findMigrationPath(formId, fromVersion, toVersion) !== null;
  }

  public migratePayload(
    formId: string,
    fromVersion: string,
    toVersion: string,
    payload: FormValues
  ): FormValues {
    const path = this.findMigrationPath(formId, fromVersion, toVersion);
    if (!path) {
      throw new Error(
        `No registered migration path for form "${formId}" from version "${fromVersion}" to "${toVersion}".`
      );
    }

    let current = deepClone(payload);
    for (const edge of path) {
      current = edge.migrate(current, {
        formId,
        fromVersion: edge.fromVersion,
        toVersion: edge.toVersion,
      });
    }
    return current;
  }
}
