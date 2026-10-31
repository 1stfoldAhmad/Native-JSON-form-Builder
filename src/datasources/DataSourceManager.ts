import type {
  DataSourceOptionMapping,
  DataSourceProvider,
  DataSourceResult,
  FieldDataSourceConfig,
  FieldOption,
} from '../types';
import { BUILT_IN_DATA_SOURCES } from '../utils/countries';
import { getByPath, isEmptyValue } from '../utils/deepPath';

export type AuthHeaderProvider = (context: {
  sourceId: string;
  url: string;
}) => Promise<Record<string, string>> | Record<string, string>;

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
}>;

export interface DataSourceManagerOptions {
  providers?: Record<string, DataSourceProvider>;
  definitions?: Record<string, FieldDataSourceConfig>;
  authProviders?: Record<string, AuthHeaderProvider>;
  fetchImpl?: FetchLike;
  maxCacheEntries?: number;
  now?: () => number;
}

export interface LoadFieldOptionsRequest {
  fieldPath: string;
  config: string | FieldDataSourceConfig;
  dependencies?: Record<string, unknown>;
  query?: string;
  page?: number;
  pageSize?: number;
  locale?: string;
  bypassCache?: boolean;
}

interface CacheEntry {
  result: DataSourceResult;
  expiresAt: number;
}

const DEFAULT_MAX_CACHE_ENTRIES = 128;

export function interpolateDataSourceUrl(
  template: string,
  vars: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.$]+)\s*\}\}/g, (_match, key: string) => {
    const val = vars[key];
    if (val === null || val === undefined) return '';
    return encodeURIComponent(String(val));
  });
}

export function mapRawItemToFieldOption(
  item: unknown,
  mapping?: DataSourceOptionMapping
): FieldOption | null {
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return { label: String(item), value: item };
  }
  if (!item || typeof item !== 'object') return null;

  const obj = item as Record<string, unknown>;
  const labelRaw = mapping ? getByPath(obj, mapping.labelKey) : (obj.label ?? obj.name ?? obj.title);
  const valueRaw = mapping ? getByPath(obj, mapping.valueKey) : (obj.value ?? obj.id ?? obj.code);

  if (valueRaw === undefined || valueRaw === null) return null;

  const descRaw = mapping?.descriptionKey
    ? getByPath(obj, mapping.descriptionKey)
    : obj.description;
  const groupRaw = mapping?.groupKey ? getByPath(obj, mapping.groupKey) : obj.group;
  const disabledRaw = mapping?.disabledKey
    ? getByPath(obj, mapping.disabledKey)
    : obj.disabled;

  return {
    label: labelRaw !== undefined && labelRaw !== null ? String(labelRaw) : String(valueRaw),
    value:
      typeof valueRaw === 'string' ||
      typeof valueRaw === 'number' ||
      typeof valueRaw === 'boolean'
        ? valueRaw
        : String(valueRaw),
    description: descRaw !== undefined && descRaw !== null ? String(descRaw) : undefined,
    group: groupRaw !== undefined && groupRaw !== null ? String(groupRaw) : undefined,
    disabled: typeof disabledRaw === 'boolean' ? disabledRaw : undefined,
    meta: obj,
  };
}

/**
 * Reactive Data Source Manager supporting static options, registered providers,
 * and declarative REST endpoints with cascading dependency short-circuiting,
 * `AbortController` request cancellation, in-flight deduplication, and LRU+TTL caching.
 */
export class DataSourceManager {
  private providers: Record<string, DataSourceProvider>;
  private definitions: Record<string, FieldDataSourceConfig>;
  private authProviders: Record<string, AuthHeaderProvider>;
  private fetchImpl?: FetchLike;
  private maxCacheEntries: number;
  private now: () => number;

  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<DataSourceResult>>();
  private activeAborts = new Map<string, AbortController>();
  private requestSeq = new Map<string, number>();

  constructor(options?: DataSourceManagerOptions) {
    this.providers = {
      ...BUILT_IN_DATA_SOURCES,
      ...(options?.providers ?? {}),
    };
    this.definitions = { ...(options?.definitions ?? {}) };
    this.authProviders = { ...(options?.authProviders ?? {}) };
    this.fetchImpl =
      options?.fetchImpl ??
      (typeof globalThis.fetch === 'function'
        ? (globalThis.fetch.bind(globalThis) as unknown as FetchLike)
        : undefined);
    this.maxCacheEntries = options?.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.now = options?.now ?? (() => Date.now());
  }

  public updateOptions(options: Partial<DataSourceManagerOptions>): void {
    if (options.providers) {
      this.providers = { ...BUILT_IN_DATA_SOURCES, ...options.providers };
    }
    if (options.definitions) {
      this.definitions = { ...options.definitions };
    }
    if (options.authProviders) {
      this.authProviders = { ...options.authProviders };
    }
    if (options.fetchImpl) {
      this.fetchImpl = options.fetchImpl;
    }
  }

  public resolveConfig(raw: string | FieldDataSourceConfig): FieldDataSourceConfig {
    if (typeof raw === 'string') {
      return this.definitions[raw] ?? { id: raw };
    }
    const base = this.definitions[raw.id];
    return base ? { ...base, ...raw } : raw;
  }

  public abortField(fieldPath: string): void {
    const ctrl = this.activeAborts.get(fieldPath);
    if (ctrl) {
      ctrl.abort();
      this.activeAborts.delete(fieldPath);
    }
  }

  public abortAll(): void {
    for (const ctrl of this.activeAborts.values()) {
      ctrl.abort();
    }
    this.activeAborts.clear();
  }

  public invalidateSource(sourceId: string): void {
    const prefix = `${sourceId}::`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  private buildCacheKey(
    cfg: FieldDataSourceConfig,
    deps: Record<string, unknown>,
    query: string,
    page: number,
    pageSize: number,
    locale: string
  ): string {
    const sortedDeps = Object.keys(deps)
      .sort()
      .map((k) => `${k}=${JSON.stringify(deps[k] ?? null)}`)
      .join('&');
    return `${cfg.id}::${cfg.url ?? ''}::${sortedDeps}::q=${query}::p=${page}::ps=${pageSize}::l=${locale}`;
  }

  public async loadFieldOptions(req: LoadFieldOptionsRequest): Promise<DataSourceResult> {
    const cfg = this.resolveConfig(req.config);
    const deps = req.dependencies ?? {};
    const query = req.query ?? '';
    const page = req.page ?? 1;
    const pageSize = req.pageSize ?? cfg.pageSize ?? 25;
    const locale = req.locale ?? 'en';

    // Short-circuit when any declared `dependsOn` field is empty — prevents wasted API calls!
    if (cfg.dependsOn && cfg.dependsOn.length > 0) {
      for (const depPath of cfg.dependsOn) {
        if (isEmptyValue(deps[depPath])) {
          this.abortField(req.fieldPath);
          return { options: [], hasMore: false };
        }
      }
    }

    const cacheKey = this.buildCacheKey(cfg, deps, query, page, pageSize, locale);
    const ttlMs =
      cfg.cacheTtlMs !== undefined
        ? cfg.cacheTtlMs
        : cfg.type === 'rest' || cfg.url
          ? 60_000
          : 0;

    if (!req.bypassCache && ttlMs > 0) {
      const hit = this.cache.get(cacheKey);
      if (hit) {
        if (hit.expiresAt > this.now()) {
          // Refresh LRU order
          this.cache.delete(cacheKey);
          this.cache.set(cacheKey, hit);
          return hit.result;
        }
        this.cache.delete(cacheKey);
      }
    }

    // Abort previous request for the same fieldPath and bump monotonic sequence token
    this.abortField(req.fieldPath);
    const seq = (this.requestSeq.get(req.fieldPath) ?? 0) + 1;
    this.requestSeq.set(req.fieldPath, seq);

    const controller = new AbortController();
    this.activeAborts.set(req.fieldPath, controller);

    const execPromise = this.executeTransport(
      cfg,
      deps,
      query,
      page,
      pageSize,
      locale,
      controller.signal
    );

    try {
      const result = await execPromise;
      if (controller.signal.aborted || this.requestSeq.get(req.fieldPath) !== seq) {
        return { options: [], hasMore: false };
      }

      if (ttlMs > 0) {
        if (this.cache.size >= this.maxCacheEntries) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(cacheKey, {
          result,
          expiresAt: this.now() + ttlMs,
        });
      }

      return result;
    } finally {
      if (this.activeAborts.get(req.fieldPath) === controller) {
        this.activeAborts.delete(req.fieldPath);
      }
      this.inFlight.delete(cacheKey);
    }
  }

  private async executeTransport(
    cfg: FieldDataSourceConfig,
    dependencies: Record<string, unknown>,
    query: string,
    page: number,
    pageSize: number,
    locale: string,
    signal: AbortSignal
  ): Promise<DataSourceResult> {
    const mode = cfg.type ?? (cfg.url ? 'rest' : cfg.options ? 'static' : 'provider');

    // 1. Static inline data source
    if (mode === 'static') {
      const normalized: FieldOption[] = (cfg.options ?? []).map((item) =>
        typeof item === 'string' ? { label: item, value: item } : item
      );
      const q = query.trim().toLowerCase();
      const filtered = q
        ? normalized.filter(
            (opt) =>
              opt.label.toLowerCase().includes(q) ||
              String(opt.value).toLowerCase().includes(q) ||
              (opt.description ?? '').toLowerCase().includes(q)
          )
        : normalized;
      const start = (page - 1) * pageSize;
      const slice = filtered.slice(start, start + pageSize);
      return {
        options: slice,
        hasMore: start + pageSize < filtered.length,
        totalCount: filtered.length,
      };
    }

    // 2. Declarative REST API data source
    if (mode === 'rest') {
      if (!cfg.url) {
        throw new Error(`REST data source "${cfg.id}" is missing a "url" property.`);
      }
      if (!this.fetchImpl) {
        throw new Error(`Global fetch is unavailable for REST data source "${cfg.id}".`);
      }

      const resolvedUrl = interpolateDataSourceUrl(cfg.url, {
        ...cfg.params,
        ...dependencies,
        query,
        page,
        pageSize,
        locale,
      });

      let authHeaders: Record<string, string> = {};
      if (cfg.authProviderId && this.authProviders[cfg.authProviderId]) {
        authHeaders = await this.authProviders[cfg.authProviderId]({
          sourceId: cfg.id,
          url: resolvedUrl,
        });
      }

      const method = cfg.method ?? 'GET';
      const init: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(cfg.headers ?? {}),
          ...authHeaders,
        },
        signal,
      };

      if (method === 'POST') {
        init.body = JSON.stringify({
          query,
          page,
          pageSize,
          dependencies,
          params: cfg.params,
          locale,
        });
      }

      const response = await this.fetchImpl(resolvedUrl, init);
      if (!response.ok) {
        throw new Error(
          `Data source "${cfg.id}" HTTP ${response.status}${
            response.statusText ? `: ${response.statusText}` : ''
          }`
        );
      }

      const body = await response.json();
      let rawItems: unknown;
      if (cfg.responsePath) {
        rawItems = getByPath(body as Record<string, unknown>, cfg.responsePath);
      } else if (Array.isArray(body)) {
        rawItems = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        rawItems = b.options ?? b.items ?? b.data ?? b.results ?? [];
      } else {
        rawItems = [];
      }

      const options: FieldOption[] = Array.isArray(rawItems)
        ? rawItems
            .map((item) => mapRawItemToFieldOption(item, cfg.mapOption))
            .filter((x): x is FieldOption => x !== null)
        : [];

      let hasMore = false;
      if (cfg.hasMorePath && body && typeof body === 'object') {
        hasMore = Boolean(getByPath(body as Record<string, unknown>, cfg.hasMorePath));
      } else if (body && typeof body === 'object' && 'hasMore' in body) {
        hasMore = Boolean((body as { hasMore?: unknown }).hasMore);
      }

      return { options, hasMore };
    }

    // 3. Registered provider function
    const provider = this.providers[cfg.id];
    if (!provider) {
      return { options: [], hasMore: false };
    }

    const rawRes = await provider({
      query,
      page,
      pageSize,
      dependencies,
      params: cfg.params,
      locale,
      signal,
    });

    if (Array.isArray(rawRes)) {
      return { options: rawRes, hasMore: false };
    }
    return {
      options: rawRes.options ?? [],
      hasMore: Boolean(rawRes.hasMore),
      nextPage: rawRes.nextPage,
      totalCount: rawRes.totalCount,
    };
  }
}
