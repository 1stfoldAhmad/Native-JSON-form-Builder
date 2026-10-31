import {
  defaultCapabilityRegistry,
  type PlatformCapabilityRegistry,
  type SchemaCapabilityReport,
} from '../capabilities/PlatformCapabilityRegistry';
import type { FormStore } from '../state/FormStore';
import { deepClone, getByPath, setByPath } from '../utils/deepPath';
import { collectSensitiveFieldPaths } from '../utils/security';

export const REDACTED_SENSITIVE_TOKEN = '[REDACTED_SENSITIVE]';

export interface FormDiagnosticSnapshot {
  formId: string;
  version?: string;
  fingerprint: string;
  structuralFingerprint: string;
  fieldCount: number;
  formulaExecutionOrder: string[];
  dependencyEdges: Record<string, string[]>;
  capabilities: SchemaCapabilityReport;
  redactedValues: Record<string, unknown>;
  sensitivePaths: string[];
  errors: Record<string, string>;
  dirty: boolean;
  valid: boolean;
  currentStep: number;
}

/**
 * Produces a structured, secret-safe runtime diagnostic snapshot of a `FormStore`
 * suitable for developer panels, bug reports, and support telemetry.
 *
 * SECURITY INVARIANT: All sensitive fields (`password`, `pin`, `otp`, `cvv`,
 * `sensitive: true`, `config.security.sensitiveFields`) are unconditionally
 * replaced with `'[REDACTED_SENSITIVE]'`.
 */
export function inspectFormRuntime(
  store: FormStore,
  options?: { capabilityRegistry?: PlatformCapabilityRegistry }
): FormDiagnosticSnapshot {
  const config = store.getConfig();
  const plan = store.getCompiledPlan();
  const state = store.getState();
  const capRegistry = options?.capabilityRegistry ?? defaultCapabilityRegistry;

  let redactedValues = deepClone(state.values);
  const sensitiveSet = collectSensitiveFieldPaths(config, config.security);
  const sensitivePaths = Array.from(sensitiveSet);

  for (const path of sensitivePaths) {
    if (getByPath(redactedValues, path) !== undefined) {
      redactedValues = setByPath(redactedValues, path, REDACTED_SENSITIVE_TOKEN);
    }
  }

  const dependencyEdges: Record<string, string[]> = {};
  for (const node of plan.nodeList) {
    const deps = Array.from(plan.graph.getDirectDependencies(node.path));
    if (deps.length > 0) {
      dependencyEdges[node.path] = deps;
    }
  }

  return {
    formId: config.id,
    version: config.version,
    fingerprint: plan.fingerprint,
    structuralFingerprint: plan.structuralFingerprint,
    fieldCount: plan.nodes.size,
    formulaExecutionOrder: [...plan.formulaEvalOrder],
    dependencyEdges,
    capabilities: capRegistry.validateSchemaCapabilities(config),
    redactedValues,
    sensitivePaths,
    errors: deepClone(state.errors),
    dirty: state.isDirty,
    valid: state.isValid,
    currentStep: state.currentStepIndex,
  };
}
