import React, { createRef } from 'react';
import { Text, TextInput, useNativeState } from '@expo/ui';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import vehicleEnterpriseJson from '../forms/vehicle-registration-enterprise.json';
import {
  ExpoForm,
  ExpoFormProvider,
  FormStore,
  MiddlewarePipeline,
  PerformanceProfiler,
  PluginRegistry,
  REDACTED_SENSITIVE_TOKEN,
  compileFormSchema,
  createFieldPackage,
  defineFormConfig,
  diffFormSchemas,
  generateFormValuesTypeScript,
  inspectFormRuntime,
  validateMigrationChain,
  type ExpoFormRef,
  type FormConfig,
  type FormValues,
} from '../src';

describe('Level 4 (Phases 5 & 6) — Plugin Platform, Field Packages, Tooling, Diagnostics & Performance', () => {
  it('mounts isolated PluginRegistry + createFieldPackage + custom formula functions + custom themes via <ExpoFormProvider /> and prevents collisions', async () => {
    const ibanFieldPkg = createFieldPackage<string, { bankPrefix?: string }>({
      type: 'ibanAccount',
      component: ({ value, onChange, customProps }) => {
        const nativeVal = useNativeState(String(value ?? ''));
        return (
          <>
            <Text>{`IBAN Prefix: ${customProps?.bankPrefix ?? 'PK'}`}</Text>
            <TextInput
              value={nativeVal}
              testID="custom-iban-input"
              onChangeText={(txt) => {
                nativeVal.set(txt.toUpperCase());
                onChange(txt.toUpperCase());
              }}
            />
          </>
        );
      },
      defaultValidator: (val: string) =>
        typeof val === 'string' && val.startsWith('PK') ? null : 'Must start with PK',
    });

    const registry = new PluginRegistry({ strictCollisions: true });
    const unregister = registry.register({
      id: '@acme/banking-suite',
      fields: [ibanFieldPkg],
      formulaFunctions: {
        IBAN_BRANCH: (args: readonly unknown[]) => String(args[0] ?? '').slice(4, 8),
      },
      conditionOperators: {
        isHblIban: (actual: unknown) => String(actual ?? '').includes('HABB'),
      },
      themes: [
        {
          id: 'acme-emerald',
          light: { seedColor: '#059669', primary: '#059669' },
          dark: { seedColor: '#34D399', primary: '#34D399' },
        },
      ],
    });

    // Duplicate registration of colliding field type throws deterministic error
    expect(() =>
      registry.register({
        id: '@acme/duplicate',
        fields: [ibanFieldPkg],
      })
    ).toThrow(/collided on already-registered field type "ibanAccount"/);

    const formRef = createRef<ExpoFormRef>();
    const config = defineFormConfig({
      id: 'plugin-iban-form',
      theme: { preset: 'acme-emerald' },
      defaults: {
        payoutIban: 'PK36HABB0000111122223333',
      },
      fields: [
        {
          name: 'payoutIban',
          type: 'ibanAccount',
          label: 'Payout IBAN',
          props: { bankPrefix: 'PK-HBL' },
        },
        {
          name: 'branchCode',
          type: 'calculated',
          label: 'Detected Bank Code',
          formula: 'IBAN_BRANCH(payoutIban)',
        },
        {
          name: 'hblPrivilegeNote',
          type: 'staticText',
          content: 'Zero-fee HBL instant transfer unlocked!',
          visibleWhen: {
            field: 'payoutIban',
            operator: 'isHblIban',
            value: true,
          },
        },
      ],
    });

    render(
      <ExpoFormProvider pluginRegistry={registry}>
        <ExpoForm ref={formRef} config={config} />
      </ExpoFormProvider>
    );

    expect(screen.getByText('IBAN Prefix: PK-HBL')).toBeTruthy();
    expect(screen.getByText('Zero-fee HBL instant transfer unlocked!')).toBeTruthy();
    expect(formRef.current?.getValue('branchCode')).toBe('HABB');

    unregister();
    expect(registry.listPlugins()).toEqual([]);
  });

  it('runs MiddlewarePipeline hooks sequentially with veto cancellation and fault isolation', async () => {
    const onError = vi.fn();
    const pipeline = new MiddlewarePipeline({
      isolateErrors: true,
      onMiddlewareError: onError,
    });

    pipeline.use('beforeFieldChange', (payload) => ({
      ...payload,
      nextValue:
        typeof payload.nextValue === 'string'
          ? payload.nextValue.trim()
          : payload.nextValue,
    }));

    pipeline.use('beforeFieldChange', () => {
      throw new Error('Telemetry plugin network blip');
    });

    pipeline.use('beforeFieldChange', (payload) => {
      if (payload.nextValue === 'FORBIDDEN') {
        return { ...payload, cancel: true };
      }
    });

    const allowed = await pipeline.run('beforeFieldChange', {
      path: 'username',
      previousValue: '',
      nextValue: '  ahmad_pk  ',
      values: {},
    });
    expect(allowed.nextValue).toBe('ahmad_pk');
    expect(allowed.cancel).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);

    const vetoed = await pipeline.run('beforeFieldChange', {
      path: 'username',
      previousValue: 'ahmad_pk',
      nextValue: '  FORBIDDEN  ',
      values: {},
    });
    expect(vetoed.cancel).toBe(true);
  });

  it('generates TypeScript interfaces, diffs breaking vs non-breaking schema evolutions, and validates enterprise showcase', async () => {
    const enterpriseConfig = vehicleEnterpriseJson as unknown as FormConfig;

    const generatedTs = generateFormValuesTypeScript(enterpriseConfig);
    expect(generatedTs).toContain(
      'export interface VehicleRegistrationEnterpriseValues {'
    );
    expect(generatedTs).toContain('chassisCode: string;');
    expect(generatedTs).toContain("originType: \"local\" | \"imported\";");
    expect(generatedTs).toContain('accessories?: Array<{');
    expect(generatedTs).toContain('inspectorSignature: FormFileAsset | null;');

    const v1 = defineFormConfig({
      id: 'merchant-app',
      version: '1.0.0',
      fields: [
        { name: 'shopName', type: 'text', required: true },
        {
          name: 'tier',
          type: 'select',
          options: [
            { label: 'Starter', value: 'starter' },
            { label: 'Legacy', value: 'legacy' },
          ],
        },
      ],
    });

    const v2 = defineFormConfig({
      id: 'merchant-app',
      version: '2.0.0',
      fields: [
        { name: 'shopName', type: 'text', required: true },
        {
          name: 'tier',
          type: 'select',
          options: [
            { label: 'Starter', value: 'starter' },
            { label: 'Enterprise', value: 'enterprise' },
          ],
        },
        { name: 'ntnNumber', type: 'text', required: true },
        { name: 'referralCode', type: 'text' },
      ],
    });

    const diff = diffFormSchemas(v1, v2);
    expect(diff.compatible).toBe(false);
    expect(diff.breakingChanges.map((c) => `${c.kind}:${c.path}`)).toEqual([
      'optionRemoved:tier',
      'newRequiredFieldWithoutDefault:ntnNumber',
    ]);
    expect(diff.nonBreakingChanges.map((c) => `${c.kind}:${c.path}`)).toEqual([
      'optionAdded:tier',
      'fieldAdded:referralCode',
    ]);

    const migCheck = validateMigrationChain({
      formId: 'merchant-app',
      fromVersion: '1.0.0',
      targetVersion: '2.0.0',
      samplePayload: { shopName: 'Lahore Mart', tier: 'legacy' },
      migrations: [
        {
          formId: 'merchant-app',
          fromVersion: '1.0.0',
          toVersion: '2.0.0',
          migrate: (values: FormValues) => ({
            ...values,
            tier: values.tier === 'legacy' ? 'enterprise' : values.tier,
            ntnNumber: 'PENDING-NTN',
          }),
        },
      ],
    });
    expect(migCheck.valid).toBe(true);
    expect(migCheck.migratedValues).toEqual({
      shopName: 'Lahore Mart',
      tier: 'enterprise',
      ntnNumber: 'PENDING-NTN',
    });

    // Verify vehicle-registration-enterprise.json formula & secret redaction in FormDiagnostics
    const store = new FormStore({
      config: enterpriseConfig,
      initialValues: {
        ownerTaxPin: '9988',
        secretPassword: 'should-stay-visible-unless-marked',
      },
    });

    // Default invoicePrice = 4,500,000 + accessories[0] (1 * 35,000) = 4,535,000
    // engineCc = 1500 -> 2% tax -> 90,700 -> totalPayable = 4,625,700
    await waitFor(() => {
      expect(store.getValue('accessoriesTotal')).toBe(35000);
      expect(store.getValue('exciseRegistrationFee')).toBe(90700);
      expect(store.getValue('totalPayable')).toBe(4625700);
    });

    const diag = inspectFormRuntime(store);
    expect(diag.sensitivePaths).toContain('ownerTaxPin');
    expect(diag.redactedValues.ownerTaxPin).toBe(REDACTED_SENSITIVE_TOKEN);
    expect(diag.formulaExecutionOrder).toEqual([
      'accessories.*.total',
      'accessoriesTotal',
      'exciseRegistrationFee',
      'totalPayable',
    ]);
  });

  it('meets large-form compile & incremental propagation performance budget with opt-in PerformanceProfiler', () => {
    const profiler = new PerformanceProfiler(false);
    // Disabled profiler records zero overhead
    profiler.measure('compile', () => 42);
    expect(profiler.getReport().metrics.compile.count).toBe(0);

    profiler.setEnabled(true);
    const fields = [];
    for (let i = 0; i < 150; i += 1) {
      if (i > 0 && i % 10 === 0) {
        fields.push({
          name: `calc_${i}`,
          type: 'calculated' as const,
          formula: `COALESCE(num_${i - 1}, 0) * 2`,
        });
      } else {
        fields.push({
          name: `num_${i}`,
          type: 'number' as const,
          defaultValue: i,
        });
      }
    }

    const largeConfig = defineFormConfig({
      id: 'perf-150-fields',
      fields,
    });

    const plan = profiler.measure('compile', () =>
      compileFormSchema(largeConfig, { bypassCache: true })
    );
    expect(plan.nodes.size).toBe(150);

    const store = new FormStore({ config: largeConfig });
    profiler.measure('propagation', () => {
      store.setValue('num_9', 500);
    });

    expect(store.getValue('calc_10')).toBe(1000);
    const report = profiler.getReport();
    expect(report.metrics.compile.count).toBe(1);
    expect(report.metrics.compile.lastMs).toBeLessThan(200);
    expect(report.metrics.propagation.lastMs).toBeLessThan(100);
  });
});
