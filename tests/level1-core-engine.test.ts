import { describe, expect, it, vi } from 'vitest';

import {
  ConditionRegistry,
  DependencyGraph,
  FormulaFunctionRegistry,
  FormStore,
  ValidationEngine,
  clearCompiledFormPlanCache,
  compileFormSchema,
  defineFormConfig,
  evaluateCondition,
  evaluateFormula,
  parseAndValidateFormConfig,
  parseFormula,
} from '../src';

describe('Level 1 (Phase 2A) — DependencyGraph, FormulaEngine, Advanced Conditions & SchemaCompiler', () => {
  it('detects circular formula dependencies via Tarjan SCC and orders non-cyclic formulas topologically', () => {
    const graph = new DependencyGraph();
    graph.registerDependencies('subtotal', ['qty', 'unitPrice'], 'formula');
    graph.registerDependencies('tax', ['subtotal', 'taxRate'], 'formula');
    graph.registerDependencies('grandTotal', ['subtotal', 'tax'], 'formula');

    expect(graph.detectFormulaCycles()).toEqual([]);
    expect(graph.getTopologicalFormulaOrder()).toEqual(['subtotal', 'tax', 'grandTotal']);

    // Introduce a cycle A -> B -> A and verify non-cyclic nodes still evaluate cleanly
    graph.registerDependencies('loopA', ['loopB'], 'formula');
    graph.registerDependencies('loopB', ['loopA'], 'formula');

    const cycles = graph.detectFormulaCycles();
    expect(cycles.length).toBe(1);
    expect(cycles[0]).toContain('loopA');
    expect(cycles[0]).toContain('loopB');

    const safeOrder = graph.getTopologicalFormulaOrder();
    expect(safeOrder).toEqual(['subtotal', 'tax', 'grandTotal']);
    expect(safeOrder).not.toContain('loopA');
  });

  it('parses and evaluates restricted formulas without eval, blocking forbidden identifiers and member calls', () => {
    // Arithmetic, precedence, rounding, ternary, percentages, strings, dates, null safety
    const res1 = evaluateFormula(
      'ROUND(baseFee + (baseFee * taxRate / 100) - DISCOUNT(100, 10), 2)',
      { baseFee: 250, taxRate: 15 }
    );
    expect(res1.error).toBeUndefined();
    expect(res1.value).toBe(197.5);

    // Null/undefined/divide-by-zero safety (never NaN or Infinity)
    expect(evaluateFormula('missingField * 10 + (100 / zeroField)', { zeroField: 0 }).value).toBe(0);

    // String & conditional helpers
    expect(
      evaluateFormula(
        'IF(accountType == "commercial", CONCAT(UPPER(prefix), "-", COALESCE(code, "000")), "PERSONAL")',
        { accountType: 'commercial', prefix: 'veh', code: null }
      ).value
    ).toBe('VEH-000');

    // Date operations with deterministic clock
    const fixedClock = () => new Date('2026-10-31T00:00:00.000Z');
    expect(
      evaluateFormula('AGE(dob)', { dob: '2000-10-31' }, { now: fixedClock }).value
    ).toBe(26);
    expect(
      evaluateFormula(
        'DAYS_BETWEEN(startDate, ADD_DAYS(startDate, 14))',
        { startDate: '2026-10-01' }
      ).value
    ).toBe(14);

    // Custom registered function
    const customRegistry = new FormulaFunctionRegistry(true);
    customRegistry.register('STAMP_DUTY', ([cc]) => (Number(cc) > 1500 ? 5000 : 1500));
    expect(
      evaluateFormula(
        'baseFee + STAMP_DUTY(engineCc)',
        { baseFee: 1000, engineCc: 1800 },
        { functionRegistry: customRegistry }
      ).value
    ).toBe(6000);

    // Security blocks: __proto__, constructor, eval, member calls
    expect(parseFormula('__proto__.polluted').valid).toBe(false);
    expect(parseFormula('eval("1+1")').valid).toBe(false);
    expect(parseFormula('account.toString()').valid).toBe(false);
  });

  it('supports calculated fields, defaultFormula, repeater $item.* formulas, and SUM(items.*.amount) incrementally', () => {
    const config = defineFormConfig({
      id: 'invoice-calculated-test',
      fields: [
        { name: 'taxRate', type: 'number', defaultValue: 10 },
        {
          name: 'discountCode',
          type: 'text',
          defaultFormula: 'CONCAT("INV-", YEAR("2026-10-31"))',
        },
        {
          name: 'items',
          type: 'repeater',
          fields: [
            { name: 'qty', type: 'number', defaultValue: 1 },
            { name: 'price', type: 'number', defaultValue: 0 },
            {
              name: 'lineTotal',
              type: 'calculated',
              formula: 'ROUND($item.qty * $item.price, 2)',
            },
          ],
        },
        {
          name: 'subtotal',
          type: 'calculated',
          formula: 'SUM(items.*.lineTotal)',
        },
        {
          name: 'grandTotal',
          type: 'calculated',
          formula: 'ROUND(subtotal + PCT(subtotal, taxRate), 2)',
        },
        {
          name: 'unrelatedNote',
          type: 'calculated',
          formula: 'UPPER(noteInput)',
        },
        {
          name: 'noteInput',
          type: 'text',
          defaultValue: 'hello',
        },
      ],
    });

    const parsed = parseAndValidateFormConfig(config);
    expect(parsed.valid).toBe(true);

    const store = new FormStore({
      config,
      initialValues: {
        items: [
          { qty: 2, price: 150 },
          { qty: 3, price: 100 },
        ],
      },
    });

    expect(store.getValue('discountCode')).toBe('INV-2026');
    expect(store.getValue('items.0.lineTotal')).toBe(300);
    expect(store.getValue('items.1.lineTotal')).toBe(300);
    expect(store.getValue('subtotal')).toBe(600);
    expect(store.getValue('grandTotal')).toBe(660);
    expect(store.getValue('unrelatedNote')).toBe('HELLO');

    // Verify incremental evaluation plan when mutating ONLY row 0's quantity:
    // Row 1 (`items.1.lineTotal`) and `unrelatedNote` MUST NOT be scheduled!
    const planForRow0 = store
      .getDependencyGraph()
      .getEvaluationPlan(['items.0.qty'], store.getValuesRef());
    expect(planForRow0.formulasToEvaluate).toEqual([
      'items.0.lineTotal',
      'subtotal',
      'grandTotal',
    ]);
    expect(planForRow0.formulasToEvaluate).not.toContain('items.1.lineTotal');
    expect(planForRow0.formulasToEvaluate).not.toContain('unrelatedNote');

    store.setValue('items.0.qty', 4);
    expect(store.getValue('items.0.lineTotal')).toBe(600);
    expect(store.getValue('subtotal')).toBe(900);
    expect(store.getValue('grandTotal')).toBe(990);

    // Removing a repeater row updates SUM(items.*.lineTotal) -> grandTotal automatically
    store.setValue('items', [{ qty: 4, price: 150, lineTotal: 600 }]);
    expect(store.getValue('subtotal')).toBe(600);
    expect(store.getValue('grandTotal')).toBe(660);
  });

  it('supports canonical AND/OR/NOT condition groups, named condition refs, rich operators, readOnlyWhen, and validation.when', () => {
    const customRegistry = new ConditionRegistry();
    customRegistry.registerOperator(
      'divisibleBy',
      (actual, divisor) => Number(actual) % Number(divisor) === 0
    );

    expect(
      evaluateCondition(
        {
          operator: 'AND',
          conditions: [
            { field: 'vehicleType', operator: 'equals', value: 'commercial' },
            {
              operator: 'OR',
              conditions: [
                { field: 'grossWeight', operator: 'greaterThan', value: 3500 },
                { field: 'axleCount', operator: 'greaterThanOrEqual', value: 3 },
              ],
            },
            {
              operator: 'NOT',
              conditions: [{ field: 'plateCode', operator: 'startsWith', value: 'GOV-' }],
            },
            { field: 'engineCc', operator: 'between', value: [1000, 5000] },
            { field: 'inspectionDate', operator: 'dateAfter', valueField: 'purchaseDate' },
            { field: 'axleCount', operator: 'divisibleBy', value: 2 },
          ],
        },
        {
          vehicleType: 'commercial',
          grossWeight: 2000,
          axleCount: 4,
          plateCode: 'COM-901',
          engineCc: 2800,
          purchaseDate: '2025-01-10',
          inspectionDate: '2026-02-15',
        },
        { registry: customRegistry }
      )
    ).toBe(true);

    // Named reusable conditions + readOnlyWhen + conditional validation (`validation.when`)
    const config = defineFormConfig({
      id: 'enterprise-conditions-test',
      conditions: {
        isCommercial: {
          operator: 'AND',
          conditions: [
            { field: 'vehicleType', operator: 'equals', value: 'commercial' },
          ],
        },
        isLockedStatus: {
          field: 'status',
          operator: 'in',
          value: ['submitted', 'approved'],
        },
      },
      fields: [
        { name: 'vehicleType', type: 'text', defaultValue: 'private' },
        { name: 'status', type: 'text', defaultValue: 'draft' },
        {
          name: 'permitNumber',
          type: 'text',
          readOnlyWhen: { ref: 'isLockedStatus' },
          validation: {
            when: { ref: 'isCommercial' },
            required: 'Commercial permit number is required',
            minLength: 6,
          },
        },
      ],
    });

    const store = new FormStore({ config });
    const engine = new ValidationEngine(config);

    // Private vehicle -> permitNumber validation is skipped even when empty!
    expect(engine.validateSync(store.getValues()).valid).toBe(true);
    expect(store.getFieldState('permitNumber').readOnly).toBe(false);

    // Switch to commercial -> permitNumber validation activates!
    store.setValue('vehicleType', 'commercial');
    const invalidRes = engine.validateSync(store.getValues());
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors.permitNumber).toBe('Commercial permit number is required');

    // Lock status -> readOnlyWhen transitions dynamically to true!
    store.setValue('status', 'approved');
    expect(store.getFieldState('permitNumber').readOnly).toBe(true);
  });

  it('batches cascading store updates, caches fingerprinted plans, and compiles 200-field schemas fast', () => {
    clearCompiledFormPlanCache();

    const fields = Array.from({ length: 200 }, (_, i) => ({
      name: `field_${i}`,
      type: i % 5 === 0 && i > 0 ? ('calculated' as const) : ('number' as const),
      defaultValue: i % 5 === 0 && i > 0 ? undefined : i,
      formula: i % 5 === 0 && i > 0 ? `field_${i - 1} * 2 + ${i}` : undefined,
      visibleWhen:
        i > 2 ? { field: `field_${i - 2}`, operator: 'greaterThanOrEqual', value: 0 } : undefined,
    }));

    const baseConfig = defineFormConfig({
      id: 'perf-200-fields',
      title: '200 Field Enterprise Form',
      fields,
    });

    const firstPlan = compileFormSchema(baseConfig);
    expect(firstPlan.nodeList.length).toBe(200);
    expect(firstPlan.reusedStructure).toBe(false);
    expect(firstPlan.compileDurationMs).toBeLessThan(100);

    // Exact cache hit returns the exact same plan instance
    const cachedPlan = compileFormSchema(baseConfig);
    expect(cachedPlan).toBe(firstPlan);

    // Changing only `defaults` or `title` triggers O(1) incremental structural reuse!
    const tweakedConfig = {
      ...baseConfig,
      title: 'Updated Title Only',
      defaults: { field_1: 42 },
    };
    const incrementalPlan = compileFormSchema(tweakedConfig);
    expect(incrementalPlan.reusedStructure).toBe(true);
    expect(incrementalPlan.structuralFingerprint).toBe(firstPlan.structuralFingerprint);
    expect(incrementalPlan.graph).toBe(firstPlan.graph);

    // Verify store.batch() coalesces multiple mutations into 1 global notification
    const store = new FormStore({ config: baseConfig });
    const listener = vi.fn();
    store.subscribeGlobal(listener);

    store.batch(() => {
      store.setValue('field_1', 10);
      store.setValue('field_2', 20);
      store.setValue('field_3', 30);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getValue('field_5')).toBe(store.getValue('field_4') as number * 2 + 5);
  });
});
