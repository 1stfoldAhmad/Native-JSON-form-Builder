import { describe, expect, it, vi } from 'vitest';

import {
  DataSourceManager,
  FormStore,
  ValidationEngine,
  defineFormConfig,
  normalizeServerValidationErrors,
  type FetchLike,
} from '../src';

describe('Level 1 (Phase 2B) — Reactive Data Sources & Advanced Async Validation', () => {
  it('supports declarative REST data sources with URL template encoding, auth providers, responsePath, mapOption, TTL caching, and empty-dependency short-circuiting', async () => {
    let clockMs = 1_000;
    const mockFetch = vi.fn<FetchLike>(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer tok_live_123');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            cities: [
              { cityCode: 'RWP', cityName: 'Rawalpindi', region: 'Punjab' },
              { cityCode: 'LHE', cityName: 'Lahore', region: 'Punjab' },
            ],
          },
          meta: { hasMore: true },
          echoUrl: url,
        }),
      };
    });

    const manager = new DataSourceManager({
      fetchImpl: mockFetch,
      now: () => clockMs,
      authProviders: {
        govPortalAuth: async () => ({ Authorization: 'Bearer tok_live_123' }),
      },
      definitions: {
        citiesByProvince: {
          id: 'citiesByProvince',
          type: 'rest',
          url: 'https://api.example.gov/v1/provinces/{{province}}/cities?q={{query}}&page={{page}}',
          authProviderId: 'govPortalAuth',
          dependsOn: ['province'],
          responsePath: 'data.cities',
          hasMorePath: 'meta.hasMore',
          cacheTtlMs: 30_000,
          mapOption: {
            labelKey: 'cityName',
            valueKey: 'cityCode',
            groupKey: 'region',
          },
        },
      },
    });

    // 1. Empty `province` dependency short-circuits with 0 HTTP requests
    const emptyRes = await manager.loadFieldOptions({
      fieldPath: 'city',
      config: 'citiesByProvince',
      dependencies: { province: '' },
    });
    expect(emptyRes.options).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(0);

    // 2. Populated `province` encodes URL parameters safely and maps options
    const res1 = await manager.loadFieldOptions({
      fieldPath: 'city',
      config: 'citiesByProvince',
      dependencies: { province: 'Punjab & North' },
      query: 'raw',
      page: 1,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.example.gov/v1/provinces/Punjab%20%26%20North/cities?q=raw&page=1'
    );
    expect(res1.hasMore).toBe(true);
    expect(res1.options).toEqual([
      {
        label: 'Rawalpindi',
        value: 'RWP',
        description: undefined,
        group: 'Punjab',
        disabled: undefined,
        meta: { cityCode: 'RWP', cityName: 'Rawalpindi', region: 'Punjab' },
      },
      {
        label: 'Lahore',
        value: 'LHE',
        description: undefined,
        group: 'Punjab',
        disabled: undefined,
        meta: { cityCode: 'LHE', cityName: 'Lahore', region: 'Punjab' },
      },
    ]);

    // 3. Repeat call within 30s TTL hits cache (still 1 HTTP call!)
    clockMs += 5_000;
    const resCached = await manager.loadFieldOptions({
      fieldPath: 'city',
      config: 'citiesByProvince',
      dependencies: { province: 'Punjab & North' },
      query: 'raw',
      page: 1,
    });
    expect(resCached.options.length).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 4. Advance clock past TTL -> refreshes from network
    clockMs += 30_000;
    await manager.loadFieldOptions({
      fieldPath: 'city',
      config: 'citiesByProvince',
      dependencies: { province: 'Punjab & North' },
      query: 'raw',
      page: 1,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts stale in-flight provider requests when a newer query arrives and cascades multi-hop dependency resets', async () => {
    const abortedSignals: boolean[] = [];
    const manager = new DataSourceManager({
      providers: {
        slowModels: ({ query, signal }) =>
          new Promise((resolve) => {
            signal?.addEventListener('abort', () => {
              abortedSignals.push(true);
              resolve([]);
            });
            setTimeout(() => {
              resolve([{ label: `Model ${query}`, value: String(query) }]);
            }, 30);
          }),
      },
    });

    const p1 = manager.loadFieldOptions({
      fieldPath: 'vehicleModel',
      config: { id: 'slowModels' },
      query: 'cor',
    });
    const p2 = manager.loadFieldOptions({
      fieldPath: 'vehicleModel',
      config: { id: 'slowModels' },
      query: 'corolla',
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(abortedSignals.length).toBe(1);
    expect(r1.options).toEqual([]);
    expect(r2.options).toEqual([{ label: 'Model corolla', value: 'corolla' }]);

    // Verify 3-level transitive cascade reset in FormStore: country -> state -> city
    const cascadeConfig = defineFormConfig({
      id: 'cascade-3-tier',
      fields: [
        { name: 'country', type: 'select', options: ['PK', 'US'] },
        {
          name: 'state',
          type: 'select',
          dataSource: { id: 'states', dependsOn: ['country'] },
        },
        {
          name: 'city',
          type: 'select',
          dataSource: { id: 'cities', dependsOn: ['state'] },
        },
      ],
    });

    const store = new FormStore({
      config: cascadeConfig,
      initialValues: { country: 'PK', state: 'Punjab', city: 'Rawalpindi' },
    });

    store.setValue('country', 'US');
    expect(store.getValue('state')).toBe('');
    expect(store.getValue('city')).toBe('');
  });

  it('runs multi-rule async validation with dependsOn cache invalidation, retry/backoff, and server payload normalization', async () => {
    let attempts = 0;
    const checkPlateFormatServer = vi.fn(async ({ value }: { value: unknown }) => {
      if (String(value).startsWith('BAD')) return 'Blacklisted prefix';
      return true;
    });
    const checkPlateAvailable = vi.fn(
      async ({ value, values }: { value: unknown; values: Record<string, unknown> }) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Temporary gateway timeout');
        }
        if (values.province === 'Punjab' && value === 'LEA-2026') {
          return 'Plate LEA-2026 is already registered in Punjab';
        }
        return true;
      }
    );

    const config = defineFormConfig({
      id: 'async-multi-rule',
      fields: [
        { name: 'province', type: 'text', defaultValue: 'Punjab' },
        {
          name: 'plateNumber',
          type: 'text',
          validation: {
            async: [
              {
                validatorId: 'checkPlateFormatServer',
                cacheTtlMs: 60_000,
              },
              {
                validatorId: 'checkPlateAvailable',
                dependsOn: ['province'],
                cacheTtlMs: 60_000,
                retry: { maxAttempts: 2, backoffMs: 5 },
              },
            ],
          },
        },
      ],
    });

    const store = new FormStore({
      config,
      initialValues: { province: 'Punjab', plateNumber: 'LEA-2026' },
      asyncValidators: {
        checkPlateFormatServer,
        checkPlateAvailable,
      },
    });

    // 1. First validation retries transient error once and catches Punjab duplicate
    const res1 = await store.validate();
    expect(res1.valid).toBe(false);
    expect(attempts).toBe(2);
    expect(res1.errors.plateNumber).toBe('Plate LEA-2026 is already registered in Punjab');

    // 2. Second validation with identical values uses TTL cache (no new backend calls!)
    const prevCalls = checkPlateAvailable.mock.calls.length;
    const resCached = await store.validate();
    expect(resCached.valid).toBe(false);
    expect(checkPlateAvailable.mock.calls.length).toBe(prevCalls);

    // 3. Mutating depended-on `province` invalidates cached async result automatically!
    store.setValue('province', 'Sindh');
    const resSindh = await store.validate();
    expect(resSindh.valid).toBe(true);
    expect(checkPlateAvailable.mock.calls.length).toBe(prevCalls + 1);

    // 4. Structured server error payload normalization (FastAPI / Laravel / RFC 7807)
    const normalized = store.setServerErrorsFromPayload({
      errors: {
        province: ['Province code rejected by excise gateway'],
      },
      detail: [{ loc: ['body', 'plateNumber'], msg: 'Customs hold on plate' }],
      formErrors: ['Submission rejected by upstream authority'],
    });
    expect(normalized.fieldErrors).toEqual({
      province: 'Province code rejected by excise gateway',
      plateNumber: 'Customs hold on plate',
    });
    expect(store.getFieldState('plateNumber').error).toBe('Customs hold on plate');
    expect(store.getState().formErrors).toEqual([
      'Submission rejected by upstream authority',
    ]);

    expect(
      normalizeServerValidationErrors('Service temporarily unavailable').formErrors
    ).toEqual(['Service temporarily unavailable']);
  });
});
