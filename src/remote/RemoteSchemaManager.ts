import { compileFormSchema } from '../compiler';
import { parseAndValidateFormConfig } from '../core/configParser';
import type { DraftStorageAdapter, FormConfig } from '../types';
import { isEngineVersionCompatible } from '../versioning/SchemaVersionRegistry';

export const LIBRARY_ENGINE_VERSION = '1.1.0';

export interface RemoteSchemaFetchResult {
  status: number;
  etag?: string;
  body?: unknown;
}

export type RemoteSchemaFetcher = (context: {
  url: string;
  ifNoneMatch?: string;
}) => Promise<RemoteSchemaFetchResult>;

interface CachedRemoteSchemaEnvelope {
  etag?: string;
  cachedAt: number;
  expiresAt: number;
  config: FormConfig;
}

export interface ResolvedRemoteSchema {
  config: FormConfig;
  source: 'remote' | 'cache' | 'fallback';
  etag?: string;
  warnings: string[];
}

/**
 * Fetches, strictly validates (`parseAndValidateFormConfig` + `compileFormSchema` +
 * `minEngineVersion`), caches, and safely falls back for server-driven JSON form definitions.
 * Invalid or unsafe remote schemas are NEVER cached or rendered.
 */
export class RemoteSchemaManager {
  private fetcher: RemoteSchemaFetcher;
  private storageAdapter?: DraftStorageAdapter;
  private engineVersion: string;
  private cacheTtlMs: number;
  private now: () => number;

  constructor(options: {
    fetcher: RemoteSchemaFetcher;
    storageAdapter?: DraftStorageAdapter;
    engineVersion?: string;
    cacheTtlMs?: number;
    now?: () => number;
  }) {
    this.fetcher = options.fetcher;
    this.storageAdapter = options.storageAdapter;
    this.engineVersion = options.engineVersion ?? LIBRARY_ENGINE_VERSION;
    this.cacheTtlMs = options.cacheTtlMs ?? 300_000;
    this.now = options.now ?? (() => Date.now());
  }

  private getCacheKey(formId: string): string {
    return `expo-form-remote-schema:${formId}`;
  }

  private validateCandidateSchema(raw: unknown): {
    config: FormConfig | null;
    errors: string[];
    warnings: string[];
  } {
    const parsed = parseAndValidateFormConfig(raw);
    if (!parsed.valid || !parsed.config) {
      return {
        config: null,
        errors: parsed.errors.map((e) => `${e.path}: ${e.message}`),
        warnings: parsed.warnings.map((w) => `${w.path}: ${w.message}`),
      };
    }

    if (
      !isEngineVersionCompatible(
        this.engineVersion,
        parsed.config.minEngineVersion
      )
    ) {
      return {
        config: null,
        errors: [
          `Remote schema requires minEngineVersion "${parsed.config.minEngineVersion}", current engine is "${this.engineVersion}".`,
        ],
        warnings: [],
      };
    }

    const compiled = compileFormSchema(parsed.config);
    const compileErrors = compiled.diagnostics.filter(
      (d) => d.severity === 'error'
    );
    if (compileErrors.length > 0) {
      return {
        config: null,
        errors: compileErrors.map((e) => `${e.path}: ${e.message}`),
        warnings: [],
      };
    }

    return {
      config: parsed.config,
      errors: [],
      warnings: parsed.warnings.map((w) => `${w.path}: ${w.message}`),
    };
  }

  public async loadSchema(options: {
    formId: string;
    url: string;
    fallbackConfig?: FormConfig;
    forceRefresh?: boolean;
  }): Promise<ResolvedRemoteSchema> {
    const cacheKey = this.getCacheKey(options.formId);
    let cachedEnvelope: CachedRemoteSchemaEnvelope | null = null;

    if (this.storageAdapter) {
      try {
        const rawCache = await Promise.resolve(
          this.storageAdapter.getItem(cacheKey)
        );
        if (rawCache) {
          cachedEnvelope = JSON.parse(rawCache) as CachedRemoteSchemaEnvelope;
        }
      } catch {
        cachedEnvelope = null;
      }
    }

    // Serve fresh local cache immediately unless forceRefresh is requested
    if (
      !options.forceRefresh &&
      cachedEnvelope &&
      cachedEnvelope.expiresAt > this.now()
    ) {
      const check = this.validateCandidateSchema(cachedEnvelope.config);
      if (check.config) {
        return {
          config: check.config,
          source: 'cache',
          etag: cachedEnvelope.etag,
          warnings: check.warnings,
        };
      }
    }

    try {
      const res = await this.fetcher({
        url: options.url,
        ifNoneMatch: cachedEnvelope?.etag,
      });

      // 304 Not Modified -> extend cached schema TTL
      if (res.status === 304 && cachedEnvelope) {
        const check = this.validateCandidateSchema(cachedEnvelope.config);
        if (check.config) {
          const refreshed: CachedRemoteSchemaEnvelope = {
            ...cachedEnvelope,
            cachedAt: this.now(),
            expiresAt: this.now() + this.cacheTtlMs,
          };
          if (this.storageAdapter) {
            await Promise.resolve(
              this.storageAdapter.setItem(cacheKey, JSON.stringify(refreshed))
            );
          }
          return {
            config: check.config,
            source: 'cache',
            etag: refreshed.etag,
            warnings: check.warnings,
          };
        }
      }

      if (res.status >= 200 && res.status < 300 && res.body !== undefined) {
        const validated = this.validateCandidateSchema(res.body);
        if (validated.config) {
          if (this.storageAdapter) {
            const envelope: CachedRemoteSchemaEnvelope = {
              etag: res.etag,
              cachedAt: this.now(),
              expiresAt: this.now() + this.cacheTtlMs,
              config: validated.config,
            };
            await Promise.resolve(
              this.storageAdapter.setItem(cacheKey, JSON.stringify(envelope))
            );
          }
          return {
            config: validated.config,
            source: 'remote',
            etag: res.etag,
            warnings: validated.warnings,
          };
        }

        // Invalid remote schema -> fall back safely without poisoning cache!
        if (cachedEnvelope) {
          const cacheCheck = this.validateCandidateSchema(cachedEnvelope.config);
          if (cacheCheck.config) {
            return {
              config: cacheCheck.config,
              source: 'cache',
              etag: cachedEnvelope.etag,
              warnings: [
                `Rejected invalid remote schema (${validated.errors.join('; ')}); using last valid cached schema.`,
              ],
            };
          }
        }
        if (options.fallbackConfig) {
          return {
            config: options.fallbackConfig,
            source: 'fallback',
            warnings: [
              `Rejected invalid remote schema (${validated.errors.join('; ')}); using bundled fallback schema.`,
            ],
          };
        }
        throw new Error(
          `Invalid remote form schema for "${options.formId}": ${validated.errors.join('; ')}`
        );
      }
    } catch (err) {
      if (cachedEnvelope) {
        const cacheCheck = this.validateCandidateSchema(cachedEnvelope.config);
        if (cacheCheck.config) {
          return {
            config: cacheCheck.config,
            source: 'cache',
            etag: cachedEnvelope.etag,
            warnings: [
              `Remote schema fetch failed (${err instanceof Error ? err.message : 'network error'}); using cached schema.`,
            ],
          };
        }
      }
      if (options.fallbackConfig) {
        return {
          config: options.fallbackConfig,
          source: 'fallback',
          warnings: [
            `Remote schema fetch failed (${err instanceof Error ? err.message : 'network error'}); using fallback schema.`,
          ],
        };
      }
      throw err;
    }

    if (options.fallbackConfig) {
      return {
        config: options.fallbackConfig,
        source: 'fallback',
        warnings: ['Remote schema unavailable; using bundled fallback schema.'],
      };
    }

    throw new Error(`Unable to load remote schema for "${options.formId}".`);
  }
}
