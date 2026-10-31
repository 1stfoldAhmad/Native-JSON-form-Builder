import {
  ConditionRegistry,
  defaultConditionRegistry,
  extractConditionFieldPaths,
} from '../conditions';
import { DependencyGraph } from '../engine/DependencyGraph';
import {
  FormulaFunctionRegistry,
  defaultFormulaFunctionRegistry,
  parseFormula,
} from '../formula';
import type {
  AsyncFieldValidationConfig,
  ConfigSchemaIssue,
  FieldConfig,
  FieldDataSourceConfig,
  FormConfig,
  PlatformCapabilityName,
} from '../types';
import { analyzeRegexSafety } from '../utils/regexSafety';
import { isBuiltInSecretFieldType, isSensitiveField } from '../utils/security';
import { computeConfigFingerprints } from './fingerprint';
import {
  SCHEMA_COMPILER_VERSION,
  type CompiledFieldNode,
  type CompiledFormPlan,
} from './types';

export interface CompileFormOptions {
  /** Custom formula function registry used to validate function names during Stage 4. */
  formulaRegistry?: FormulaFunctionRegistry;
  /** Custom condition registry used to resolve named conditions during Stage 3. */
  conditionRegistry?: ConditionRegistry;
  /** Bypass compiler plan cache. */
  bypassCache?: boolean;
}

const PLAN_CACHE_LIMIT = 64;
const fullPlanCache = new Map<string, CompiledFormPlan>();
const structuralPlanCache = new Map<string, CompiledFormPlan>();

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function normalizeAsyncRules(
  asyncCfg?: AsyncFieldValidationConfig | readonly AsyncFieldValidationConfig[]
): readonly AsyncFieldValidationConfig[] {
  if (!asyncCfg) return [];
  if (Array.isArray(asyncCfg)) return asyncCfg as readonly AsyncFieldValidationConfig[];
  return [asyncCfg as AsyncFieldValidationConfig];
}

function inferFieldCapabilities(
  field: FieldConfig
): { required?: PlatformCapabilityName; optional?: PlatformCapabilityName } {
  switch (field.type) {
    case 'cameraCapture':
      return { optional: 'camera' };
    case 'imagePicker':
    case 'multiImagePicker':
    case 'avatar':
      return { optional: 'gallery' };
    case 'documentScan':
      return { optional: 'documentScanner' };
    case 'signature':
      return { optional: 'signature' };
    case 'barcode':
    case 'qrCode':
      return { optional: 'barcodeScanner' };
    case 'coordinates':
    case 'mapPin':
    case 'addressAutocomplete':
      return { optional: 'location' };
    case 'date':
    case 'time':
    case 'dateTime':
    case 'dateRange':
    case 'dateOfBirth':
    case 'expirationDate':
      return { optional: 'nativeDatePicker' };
    case 'color':
      return { optional: 'nativeColorPicker' };
    default:
      if (field.scan) {
        return { optional: 'barcodeScanner' };
      }
      return {};
  }
}

/**
 * 10-Stage Schema Compiler turning declarative JSON `FormConfig` into an optimized,
 * validated, fingerprinted `CompiledFormPlan` shared by `FormStore`, `ValidationEngine`,
 * `DataSourceManager`, and `FormRenderer`.
 */
export function compileFormSchema(
  config: FormConfig,
  options?: CompileFormOptions
): CompiledFormPlan {
  const startMs = nowMs();
  const { fingerprint, structuralFingerprint } = computeConfigFingerprints(config);
  const formulaRegistry = options?.formulaRegistry ?? defaultFormulaFunctionRegistry;
  const conditionRegistry = options?.conditionRegistry ?? defaultConditionRegistry;

  if (!options?.bypassCache) {
    const exactHit = fullPlanCache.get(fingerprint);
    if (exactHit) {
      return exactHit;
    }

    // Incremental Recompilation fast path: if structural fingerprint matches, reuse
    // compiled nodes, ASTs, DependencyGraph, topological order, and diagnostics in O(1)!
    const structuralHit = structuralPlanCache.get(structuralFingerprint);
    if (structuralHit) {
      const reusedPlan: CompiledFormPlan = {
        ...structuralHit,
        fingerprint,
        config,
        compileDurationMs: Math.max(0, nowMs() - startMs),
        reusedStructure: true,
      };
      cachePlan(fingerprint, structuralFingerprint, reusedPlan);
      return reusedPlan;
    }
  }

  const diagnostics: ConfigSchemaIssue[] = [];
  const nodes = new Map<string, CompiledFieldNode>();
  const nodeList: CompiledFieldNode[] = [];
  const graph = new DependencyGraph();
  const namedConditions = config.conditions ?? {};
  const sensitivePaths = new Set<string>();
  const builtInSecretPaths = new Set<string>();
  const requiredCapabilities = new Set<PlatformCapabilityName>(
    config.capabilities?.required ?? []
  );
  const optionalCapabilities = new Set<PlatformCapabilityName>(
    config.capabilities?.optional ?? []
  );
  const defaultFormulaPaths: string[] = [];

  // Pre-build lookup of top-level fields by name so sections/steps referencing string names resolve cleanly
  const topLevelByName = new Map<string, FieldConfig>();
  for (const f of config.fields ?? []) {
    if (f.name) topLevelByName.set(f.name, f);
  }

  const sectionByField = new Map<string, string>();
  const stepByField = new Map<string, string>();

  for (const sec of config.sections ?? []) {
    for (const entry of sec.fields ?? []) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (name) sectionByField.set(name, sec.id);
    }
  }

  for (const step of config.steps ?? []) {
    for (const entry of step.fields ?? []) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (name) stepByField.set(name, step.id);
    }
  }

  // Collect root FieldConfigs in declaration order without duplicating fields referenced by string name
  const seenRootObjects = new Set<FieldConfig>();
  const seenRootNames = new Set<string>();
  const rootFields: FieldConfig[] = [];

  const pushRootField = (entry: FieldConfig | string) => {
    const resolved = typeof entry === 'string' ? topLevelByName.get(entry) : entry;
    if (!resolved || seenRootObjects.has(resolved)) return;
    if (resolved.name && seenRootNames.has(resolved.name)) {
      // Stage 2: duplicate field path warning when two distinct objects share a name
      diagnostics.push({
        path: `fields.${resolved.name}`,
        message: `Duplicate field name "${resolved.name}" encountered during compilation.`,
        severity: 'error',
      });
      return;
    }
    seenRootObjects.add(resolved);
    if (resolved.name) seenRootNames.add(resolved.name);
    rootFields.push(resolved);
  };

  for (const f of config.fields ?? []) pushRootField(f);
  for (const sec of config.sections ?? []) {
    for (const entry of sec.fields ?? []) pushRootField(entry);
  }
  for (const step of config.steps ?? []) {
    for (const entry of step.fields ?? []) pushRootField(entry);
  }

  // Stage 3 pre-pass: validate named conditions in `config.conditions` for circular refs
  for (const [condName, condExpr] of Object.entries(namedConditions)) {
    const visited = new Set<string>([condName]);
    const checkCycle = (expr: unknown): boolean => {
      if (!expr || typeof expr !== 'object') return false;
      const obj = expr as Record<string, unknown>;
      if (typeof obj.ref === 'string') {
        const ref = obj.ref.trim();
        if (visited.has(ref)) return true;
        const nextTarget = namedConditions[ref] ?? conditionRegistry.getCondition(ref);
        if (!nextTarget) {
          diagnostics.push({
            path: `conditions.${condName}`,
            message: `Named condition "${condName}" references unknown condition "${ref}".`,
            severity: 'warning',
          });
        } else {
          visited.add(ref);
          if (checkCycle(nextTarget)) return true;
          visited.delete(ref);
        }
      }
      for (const key of ['conditions', 'and', 'or'] as const) {
        if (Array.isArray(obj[key])) {
          for (const child of obj[key] as unknown[]) {
            if (checkCycle(child)) return true;
          }
        }
      }
      if (obj.not && checkCycle(obj.not)) return true;
      return false;
    };

    if (checkCycle(condExpr)) {
      diagnostics.push({
        path: `conditions.${condName}`,
        message: `Circular condition reference detected starting from "${condName}".`,
        severity: 'error',
      });
    }
  }

  // Stages 1, 2, 3, 4, 5, 6, 7, 8, 9 — Walk field hierarchy (including repeater item templates!)
  const walkFields = (
    list: readonly FieldConfig[],
    pathPrefix: string,
    repeaterPrefix: string | undefined
  ) => {
    for (const field of list) {
      const path = field.name
        ? pathPrefix
          ? `${pathPrefix}.${field.name}`
          : field.name
        : '';

      // Stage 8: Capabilities
      const cap = inferFieldCapabilities(field);
      if (cap.required) requiredCapabilities.add(cap.required);
      if (cap.optional && !requiredCapabilities.has(cap.optional)) {
        optionalCapabilities.add(cap.optional);
      }

      if (path) {
        // Stage 2: Regex safety diagnostics
        const regexCandidates: string[] = [];
        const rawRegex = field.validation?.regex;
        if (typeof rawRegex === 'string') {
          regexCandidates.push(rawRegex);
        } else if (Array.isArray(rawRegex)) {
          for (const r of rawRegex) regexCandidates.push(r.pattern);
        } else if (rawRegex && typeof rawRegex === 'object' && 'pattern' in rawRegex) {
          regexCandidates.push((rawRegex as { pattern: string }).pattern);
        }
        for (const pattern of regexCandidates) {
          const safety = analyzeRegexSafety(pattern);
          if (!safety.safe) {
            diagnostics.push({
              path,
              message: `Unsafe regular expression on "${path}": ${safety.reason}`,
              severity: 'error',
            });
          }
        }

        // Stage 4: Compile `formula` & `defaultFormula`
        let formulaAst: CompiledFieldNode['formulaAst'];
        let defaultFormulaAst: CompiledFieldNode['defaultFormulaAst'];

        if (typeof field.formula === 'string' && field.formula.trim() !== '') {
          const parsed = parseFormula(field.formula, {
            repeaterTemplatePrefix: repeaterPrefix,
          });
          if (!parsed.valid || !parsed.ast) {
            diagnostics.push({
              path: `${path}.formula`,
              message: `Invalid formula on "${path}": ${parsed.error ?? 'Syntax error'}`,
              severity: 'error',
            });
          } else {
            formulaAst = parsed.ast;
            for (const fnName of parsed.functionCalls) {
              if (!formulaRegistry.has(fnName)) {
                diagnostics.push({
                  path: `${path}.formula`,
                  message: `Unknown formula function "${fnName}" referenced on "${path}".`,
                  severity: 'warning',
                });
              }
            }
            graph.markFormulaNode(path);
            graph.registerDependencies(path, parsed.dependencies, 'formula');
          }
        } else if (field.computed) {
          graph.markFormulaNode(path);
          if (field.computed.fields) {
            const deps = field.computed.fields.map((d) =>
              d.startsWith('$item.') && repeaterPrefix
                ? `${repeaterPrefix}.${d.slice('$item.'.length)}`
                : d
            );
            graph.registerDependencies(path, deps, 'formula');
          }
          if (field.computed.template) {
            const matches = field.computed.template.matchAll(
              /\{\{\s*([a-zA-Z0-9_.$[\]]+)\s*\}\}/g
            );
            const tplDeps: string[] = [];
            for (const m of matches) {
              if (m[1]) {
                tplDeps.push(
                  m[1].startsWith('$item.') && repeaterPrefix
                    ? `${repeaterPrefix}.${m[1].slice('$item.'.length)}`
                    : m[1]
                );
              }
            }
            graph.registerDependencies(path, tplDeps, 'formula');
          }
          if (field.computed.when) {
            const whenDeps = extractConditionFieldPaths(field.computed.when, new Set(), {
              namedConditions,
              registry: conditionRegistry,
              repeaterTemplatePrefix: repeaterPrefix,
            });
            graph.registerDependencies(path, whenDeps, 'formula');
          }
        }

        if (
          typeof field.defaultFormula === 'string' &&
          field.defaultFormula.trim() !== ''
        ) {
          const parsedDefault = parseFormula(field.defaultFormula, {
            repeaterTemplatePrefix: repeaterPrefix,
          });
          if (!parsedDefault.valid || !parsedDefault.ast) {
            diagnostics.push({
              path: `${path}.defaultFormula`,
              message: `Invalid defaultFormula on "${path}": ${parsedDefault.error ?? 'Syntax error'}`,
              severity: 'error',
            });
          } else {
            defaultFormulaAst = parsedDefault.ast;
            defaultFormulaPaths.push(path);
            graph.registerDependencies(
              path,
              parsedDefault.dependencies,
              'defaultFormula'
            );
          }
        }

        // Stage 3 & Stage 5: Condition dependencies -> DependencyGraph
        const condOpts = {
          namedConditions,
          registry: conditionRegistry,
          repeaterTemplatePrefix: repeaterPrefix,
        };

        const visDeps = new Set<string>();
        extractConditionFieldPaths(field.visibleWhen, visDeps, condOpts);
        extractConditionFieldPaths(field.hiddenWhen, visDeps, condOpts);
        graph.registerDependencies(path, visDeps, 'visibility');

        const enabledDeps = new Set<string>();
        extractConditionFieldPaths(field.enabledWhen, enabledDeps, condOpts);
        extractConditionFieldPaths(field.disabledWhen, enabledDeps, condOpts);
        graph.registerDependencies(path, enabledDeps, 'enabled');

        if (field.readOnlyWhen) {
          const roDeps = extractConditionFieldPaths(
            field.readOnlyWhen,
            new Set(),
            condOpts
          );
          graph.registerDependencies(path, roDeps, 'readOnly');
        }

        const reqDeps = new Set<string>();
        extractConditionFieldPaths(field.requiredWhen, reqDeps, condOpts);
        extractConditionFieldPaths(field.validation?.requiredWhen, reqDeps, condOpts);
        graph.registerDependencies(path, reqDeps, 'required');

        // Stage 6: Validation dependencies
        const asyncRules = normalizeAsyncRules(field.validation?.async);
        const valDeps = new Set<string>();
        extractConditionFieldPaths(field.validation?.when, valDeps, condOpts);
        if (field.type === 'confirmPassword') {
          valDeps.add(field.passwordField ?? field.validation?.equalsField ?? 'password');
        }
        if (field.passwordField) valDeps.add(field.passwordField);
        if (field.countryField) valDeps.add(field.countryField);
        if (field.validation?.equalsField) valDeps.add(field.validation.equalsField);
        if (field.validation?.notEqualsField)
          valDeps.add(field.validation.notEqualsField);
        if (field.validation?.greaterThanField)
          valDeps.add(field.validation.greaterThanField);
        if (field.validation?.lessThanField) valDeps.add(field.validation.lessThanField);
        if (field.validation?.notBeforeField) valDeps.add(field.validation.notBeforeField);
        if (field.validation?.notAfterField) valDeps.add(field.validation.notAfterField);
        if (field.validation?.phone?.countryField) {
          valDeps.add(field.validation.phone.countryField);
        }
        if (field.validation?.postalCodeCountryField) {
          valDeps.add(field.validation.postalCodeCountryField);
        }
        if (field.validation?.crossField) {
          for (const cf of field.validation.crossField) {
            if (cf.targetField) valDeps.add(cf.targetField);
            extractConditionFieldPaths(cf.when, valDeps, condOpts);
          }
        }
        for (const asyncRule of asyncRules) {
          if (asyncRule.dependsOn) {
            for (const dep of asyncRule.dependsOn) valDeps.add(dep);
          }
          extractConditionFieldPaths(asyncRule.when, valDeps, condOpts);
        }
        graph.registerDependencies(path, valDeps, 'validation');

        // Stage 7: Data source binding & cascade dependencies
        let resolvedDataSource: FieldDataSourceConfig | undefined;
        if (typeof field.dataSource === 'string') {
          resolvedDataSource = config.dataSources?.[field.dataSource] ?? {
            id: field.dataSource,
          };
        } else if (field.dataSource) {
          resolvedDataSource = config.dataSources?.[field.dataSource.id]
            ? { ...config.dataSources[field.dataSource.id], ...field.dataSource }
            : field.dataSource;
        }
        if (resolvedDataSource?.dependsOn && resolvedDataSource.dependsOn.length > 0) {
          const resetOnChange = resolvedDataSource.resetOnDependencyChange !== false;
          const dsDeps = resolvedDataSource.dependsOn.map((d) =>
            d.startsWith('$item.') && repeaterPrefix
              ? `${repeaterPrefix}.${d.slice('$item.'.length)}`
              : d
          );
          graph.registerDependencies(path, dsDeps, 'dataSource', { resetOnChange });
        }

        // Stage 9: Sensitive & built-in secret metadata
        const sensitive = isSensitiveField(field, config.security);
        const builtInSecret = isBuiltInSecretFieldType(field.type);
        if (sensitive && !path.includes('.*')) sensitivePaths.add(path);
        if (builtInSecret && !path.includes('.*')) builtInSecretPaths.add(path);

        const compiledNode: CompiledFieldNode = {
          path,
          isRepeaterTemplate: Boolean(repeaterPrefix),
          repeaterPrefix,
          field,
          formulaAst,
          defaultFormulaAst,
          dataSource: resolvedDataSource,
          asyncRules,
          isSensitive: sensitive,
          isBuiltInSecret: builtInSecret,
          sectionId: field.name ? sectionByField.get(field.name) : undefined,
          stepId: field.name ? stepByField.get(field.name) : undefined,
        };

        nodes.set(path, compiledNode);
        nodeList.push(compiledNode);
      }

      // Recurse into nested `objectGroup`, `repeater`/`arrayGroup`, `stepGroup`, or structural layout children
      if (field.type === 'stepGroup' && field.steps && field.steps.length > 0) {
        for (const st of field.steps) {
          walkFields(st.fields, pathPrefix, repeaterPrefix);
        }
      } else if (field.fields && field.fields.length > 0) {
        if (
          field.type === 'repeater' ||
          field.type === 'arrayGroup' ||
          field.type === 'array'
        ) {
          if (path) {
            const nextRepeaterPrefix = `${path}.*`;
            walkFields(field.fields, nextRepeaterPrefix, nextRepeaterPrefix);
          }
        } else if (field.type === 'objectGroup' || field.type === 'object') {
          walkFields(field.fields, path || pathPrefix, repeaterPrefix);
        } else {
          walkFields(field.fields, pathPrefix, repeaterPrefix);
        }
      }
    }
  };

  walkFields(rootFields, '', undefined);

  // Step visibility & skip dependencies
  for (const step of config.steps ?? []) {
    const stepDeps = new Set<string>();
    extractConditionFieldPaths(step.visibleWhen, stepDeps, {
      namedConditions,
      registry: conditionRegistry,
    });
    extractConditionFieldPaths(step.skipWhen, stepDeps, {
      namedConditions,
      registry: conditionRegistry,
    });
    graph.registerDependencies(`$step.${step.id}`, stepDeps, 'stepVisibility');
  }

  // Stage 5: Detect formula & data-source cycles
  for (const cycle of graph.detectFormulaCycles()) {
    diagnostics.push({
      path: cycle[0] ?? 'formula',
      message: `Circular formula dependency detected: ${cycle.join(' -> ')}`,
      severity: 'error',
    });
  }

  for (const cycle of graph.detectCycles(new Set(['dataSource']))) {
    diagnostics.push({
      path: cycle[0] ?? 'dataSource',
      message: `Circular cascading dataSource dependency detected: ${cycle.join(' -> ')}`,
      severity: 'error',
    });
  }

  const formulaEvalOrder = graph.getTopologicalFormulaOrder();

  // Extract schema-level required property names
  const schemaRequiredFields = new Set<string>();
  if (config.schema?.required) {
    for (const r of config.schema.required) schemaRequiredFields.add(r);
  }

  const plan: CompiledFormPlan = {
    compilerVersion: SCHEMA_COMPILER_VERSION,
    fingerprint,
    structuralFingerprint,
    formId: config.id,
    config,
    nodes,
    nodeList,
    graph,
    formulaEvalOrder,
    defaultFormulaPaths,
    namedConditions,
    schemaRequiredFields,
    sensitivePaths,
    builtInSecretPaths,
    requiredCapabilities,
    optionalCapabilities,
    diagnostics,
    compileDurationMs: Math.max(0, nowMs() - startMs),
    reusedStructure: false,
  };

  if (!options?.bypassCache) {
    cachePlan(fingerprint, structuralFingerprint, plan);
  }

  return plan;
}

function cachePlan(
  fingerprint: string,
  structuralFingerprint: string,
  plan: CompiledFormPlan
): void {
  if (fullPlanCache.size >= PLAN_CACHE_LIMIT) {
    const oldest = fullPlanCache.keys().next().value;
    if (oldest !== undefined) fullPlanCache.delete(oldest);
  }
  fullPlanCache.set(fingerprint, plan);

  if (structuralPlanCache.size >= PLAN_CACHE_LIMIT) {
    const oldest = structuralPlanCache.keys().next().value;
    if (oldest !== undefined) structuralPlanCache.delete(oldest);
  }
  structuralPlanCache.set(structuralFingerprint, plan);
}

export function clearCompiledFormPlanCache(): void {
  fullPlanCache.clear();
  structuralPlanCache.clear();
}
