import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  DataSourceProvider,
  DataSourceResult,
  FieldConfig,
  FieldDataSourceConfig,
  FieldOption,
} from '../types';
import { createDebounced } from '../utils/debounce';

export function normalizeFieldOptions(
  rawOptions: readonly (FieldOption | string)[] | undefined
): FieldOption[] {
  if (!rawOptions) return [];
  return rawOptions.map((item) =>
    typeof item === 'string' ? { label: item, value: item } : item
  );
}

export function normalizeDataSourceConfig(
  ds: string | FieldDataSourceConfig | undefined
): FieldDataSourceConfig | null {
  if (!ds) return null;
  if (typeof ds === 'string') return { id: ds };
  return ds;
}

export interface UseFieldOptionsParams {
  field: FieldConfig;
  dataSources: Record<string, DataSourceProvider>;
  getFieldValue: (path: string) => unknown;
  locale: string;
  searchQuery?: string;
}

export function useFieldOptions({
  field,
  dataSources,
  getFieldValue,
  locale,
  searchQuery = '',
}: UseFieldOptionsParams) {
  const staticOptions = useMemo(() => normalizeFieldOptions(field.options), [field.options]);
  const dsConfig = useMemo(() => normalizeDataSourceConfig(field.dataSource), [field.dataSource]);

  const [remoteOptions, setRemoteOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const depValuesKey = useMemo(() => {
    if (!dsConfig?.dependsOn?.length) return '';
    return dsConfig.dependsOn.map((d) => `${d}:${String(getFieldValue(d) ?? '')}`).join('|');
  }, [dsConfig, getFieldValue]);

  const abortRef = useRef<AbortController | null>(null);

  const executeFetch = useCallback(
    async (query: string, targetPage: number, append: boolean) => {
      if (!dsConfig) return;
      const provider = dataSources[dsConfig.id];
      if (!provider) {
        setRemoteOptions([]);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const dependencies: Record<string, unknown> = {};
      for (const dep of dsConfig.dependsOn ?? []) {
        dependencies[dep] = getFieldValue(dep);
      }

      setError(null);

      const applyResolved = (res: FieldOption[] | DataSourceResult) => {
        let list: FieldOption[];
        let more = false;
        if (Array.isArray(res)) {
          list = res;
        } else {
          const structured = res as DataSourceResult;
          list = structured.options ?? [];
          more = Boolean(structured.hasMore);
        }
        setRemoteOptions((prev) => (append ? [...prev, ...list] : list));
        setPage(targetPage);
        setHasMore(more);
        setLoading(false);
      };

      try {
        const rawRes = provider({
          query,
          page: targetPage,
          pageSize: dsConfig.pageSize ?? 25,
          dependencies,
          params: dsConfig.params,
          locale,
          signal: controller.signal,
        });

        if (rawRes && typeof (rawRes as PromiseLike<unknown>).then === 'function') {
          setLoading(true);
          const res = await rawRes;
          if (controller.signal.aborted) return;
          applyResolved(res);
        } else {
          applyResolved(rawRes as FieldOption[] | DataSourceResult);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load options');
          setLoading(false);
        }
      }
    },
    [dsConfig, dataSources, getFieldValue, locale]
  );

  const debouncedQueryFetch = useMemo(
    () =>
      createDebounced((q: string) => {
        void executeFetch(q, 1, false);
      }, dsConfig?.debounceMs ?? 250),
    [executeFetch, dsConfig?.debounceMs]
  );

  useEffect(() => {
    if (!dsConfig) return;
    if (searchQuery) {
      debouncedQueryFetch(searchQuery);
    } else {
      debouncedQueryFetch.cancel();
      void executeFetch('', 1, false);
    }
    return () => {
      debouncedQueryFetch.cancel();
    };
  }, [dsConfig, depValuesKey, searchQuery, executeFetch, debouncedQueryFetch]);

  const loadMore = useCallback(() => {
    if (!dsConfig || loading || !hasMore) return;
    void executeFetch(searchQuery, page + 1, true);
  }, [dsConfig, loading, hasMore, executeFetch, searchQuery, page]);

  // Combine static options (filtered locally when no remote dsConfig) or remote options
  const options = useMemo(() => {
    if (dsConfig) {
      return remoteOptions;
    }
    if (!searchQuery.trim()) {
      return staticOptions;
    }
    const q = searchQuery.trim().toLowerCase();
    return staticOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        String(opt.value).toLowerCase().includes(q) ||
        (opt.description ?? '').toLowerCase().includes(q) ||
        (opt.group ?? '').toLowerCase().includes(q)
    );
  }, [dsConfig, remoteOptions, staticOptions, searchQuery]);

  return {
    options,
    allKnownOptions: dsConfig ? remoteOptions : staticOptions,
    loading,
    error,
    hasMore,
    loadMore,
    isRemote: Boolean(dsConfig),
  };
}
