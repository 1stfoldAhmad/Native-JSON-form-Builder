import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ActiveFormContext } from '../core/context';
import { DataSourceManager } from '../datasources/DataSourceManager';
import type {
  DataSourceProvider,
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
  ds: string | FieldDataSourceConfig | undefined,
  definitions?: Record<string, FieldDataSourceConfig>
): FieldDataSourceConfig | null {
  if (!ds) return null;
  if (typeof ds === 'string') {
    return definitions?.[ds] ?? { id: ds };
  }
  const base = definitions?.[ds.id];
  return base ? { ...base, ...ds } : ds;
}

export interface UseFieldOptionsParams {
  field: FieldConfig;
  fieldPath?: string;
  dataSources: Record<string, DataSourceProvider>;
  getFieldValue: (path: string) => unknown;
  locale: string;
  searchQuery?: string;
}

export function useFieldOptions({
  field,
  fieldPath,
  dataSources,
  getFieldValue,
  locale,
  searchQuery = '',
}: UseFieldOptionsParams) {
  const activeForm = useContext(ActiveFormContext);
  const formDefinitions = activeForm?.config.dataSources;

  const staticOptions = useMemo(
    () => normalizeFieldOptions(field.options),
    [field.options]
  );
  const dsConfig = useMemo(
    () => normalizeDataSourceConfig(field.dataSource, formDefinitions),
    [field.dataSource, formDefinitions]
  );

  const managerRef = useRef<DataSourceManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new DataSourceManager({
      providers: dataSources,
      definitions: formDefinitions,
    });
  } else {
    managerRef.current.updateOptions({
      providers: dataSources,
      definitions: formDefinitions,
    });
  }

  const [remoteOptions, setRemoteOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const effectivePath = fieldPath ?? field.name ?? field.id ?? 'picker';

  const depValuesKey = useMemo(() => {
    if (!dsConfig?.dependsOn?.length) return '';
    return dsConfig.dependsOn
      .map((d) => `${d}:${String(getFieldValue(d) ?? '')}`)
      .join('|');
  }, [dsConfig, getFieldValue]);

  const executeFetch = useCallback(
    async (query: string, targetPage: number, append: boolean, bypassCache = false) => {
      if (!dsConfig || !managerRef.current) return;

      const dependencies: Record<string, unknown> = {};
      for (const dep of dsConfig.dependsOn ?? []) {
        dependencies[dep] = getFieldValue(dep);
      }

      setError(null);
      setLoading(true);

      try {
        const res = await managerRef.current.loadFieldOptions({
          fieldPath: effectivePath,
          config: dsConfig,
          dependencies,
          query,
          page: targetPage,
          pageSize: dsConfig.pageSize ?? 25,
          locale,
          bypassCache,
        });

        setRemoteOptions((prev) =>
          append ? [...prev, ...res.options] : res.options
        );
        setPage(targetPage);
        setHasMore(Boolean(res.hasMore));
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load options');
        setLoading(false);
      }
    },
    [dsConfig, effectivePath, getFieldValue, locale]
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

  useEffect(() => {
    const mgr = managerRef.current;
    return () => {
      mgr?.abortAll();
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!dsConfig || loading || !hasMore) return;
    void executeFetch(searchQuery, page + 1, true);
  }, [dsConfig, loading, hasMore, executeFetch, searchQuery, page]);

  const retry = useCallback(() => {
    if (!dsConfig) return;
    void executeFetch(searchQuery, 1, false, true);
  }, [dsConfig, executeFetch, searchQuery]);

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
    retry,
    isRemote: Boolean(dsConfig),
  };
}
