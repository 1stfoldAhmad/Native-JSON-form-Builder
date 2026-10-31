import type { FieldConfig, FormConfig, PermissionRuleConfig } from '../types';

export interface ActorIdentity {
  actorId?: string;
  roles: readonly string[];
}

export interface EvaluatedPermissionState {
  canView: boolean;
  canEdit: boolean;
  isReadOnly: boolean;
  isRequired: boolean;
  canExecuteAction: boolean;
}

/**
 * Evaluates role-based UX & client-side validation permissions.
 *
 * SECURITY INVARIANT:
 * Client-side visibility, disabled, and read-only rules are UX controls ONLY and must NEVER
 * be treated as an authorization boundary. All sensitive field/step/workflow access rules
 * MUST also be enforced server-side. Use `extractServerPermissionManifest()` to export the
 * declarative permission rules for server-side verification.
 */
export function evaluatePermissionRule(
  rule: PermissionRuleConfig | undefined,
  actorRoles: readonly string[]
): EvaluatedPermissionState {
  if (!rule) {
    return {
      canView: true,
      canEdit: true,
      isReadOnly: false,
      isRequired: false,
      canExecuteAction: true,
    };
  }

  const roleSet = new Set(actorRoles);
  const hasAny = (list: readonly string[]) => list.some((r) => roleSet.has(r));

  let canView = true;
  if (rule.visibleForRoles && rule.visibleForRoles.length > 0) {
    canView = hasAny(rule.visibleForRoles);
  }
  if (canView && rule.hiddenForRoles && rule.hiddenForRoles.length > 0) {
    if (hasAny(rule.hiddenForRoles)) canView = false;
  }

  let canEdit = canView;
  if (canEdit && rule.editableForRoles && rule.editableForRoles.length > 0) {
    canEdit = hasAny(rule.editableForRoles);
  }
  if (canEdit && rule.readOnlyForRoles && rule.readOnlyForRoles.length > 0) {
    if (hasAny(rule.readOnlyForRoles)) canEdit = false;
  }

  const isRequired = Boolean(
    canView &&
      rule.requiredForRoles &&
      rule.requiredForRoles.length > 0 &&
      hasAny(rule.requiredForRoles)
  );

  const canExecuteAction =
    !rule.allowedRoles ||
    rule.allowedRoles.length === 0 ||
    hasAny(rule.allowedRoles);

  return {
    canView,
    canEdit,
    isReadOnly: !canEdit,
    isRequired,
    canExecuteAction,
  };
}

export interface ServerPermissionManifestEntry {
  targetType: 'form' | 'section' | 'step' | 'field';
  targetId: string;
  permissions: PermissionRuleConfig;
}

/**
 * Extracts all declared permission policies from a `FormConfig` into an explicit manifest
 * that backend APIs can inspect to enforce server-side field/step/workflow authorization.
 */
export function extractServerPermissionManifest(
  config: FormConfig
): ServerPermissionManifestEntry[] {
  const entries: ServerPermissionManifestEntry[] = [];

  if (config.permissions) {
    entries.push({
      targetType: 'form',
      targetId: config.id,
      permissions: config.permissions,
    });
  }

  for (const sec of config.sections ?? []) {
    if (sec.permissions) {
      entries.push({
        targetType: 'section',
        targetId: sec.id,
        permissions: sec.permissions,
      });
    }
  }

  for (const step of config.steps ?? []) {
    if (step.permissions) {
      entries.push({
        targetType: 'step',
        targetId: step.id,
        permissions: step.permissions,
      });
    }
  }

  const visitFields = (list: readonly FieldConfig[] | undefined, prefix = '') => {
    if (!list) return;
    for (const f of list) {
      const path = f.name ? (prefix ? `${prefix}.${f.name}` : f.name) : prefix;
      if (f.permissions && path) {
        entries.push({
          targetType: 'field',
          targetId: path,
          permissions: f.permissions,
        });
      }
      if (f.fields) {
        visitFields(f.fields, f.type === 'objectGroup' && f.name ? path : prefix);
      }
      if (f.steps) {
        for (const st of f.steps) visitFields(st.fields, prefix);
      }
    }
  };

  visitFields(config.fields);
  for (const sec of config.sections ?? []) {
    visitFields(sec.fields.filter((x): x is FieldConfig => typeof x !== 'string'));
  }
  for (const step of config.steps ?? []) {
    visitFields(step.fields);
  }

  return entries;
}
