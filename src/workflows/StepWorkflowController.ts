import { evaluateCondition } from '../conditions/evaluator';
import type { FormConfig, FormStepConfig, FormValues } from '../types';
import { evaluatePermissionRule } from './PermissionsPolicy';

export interface StepRuntimeSummary {
  id: string;
  index: number;
  visible: boolean;
  skipped: boolean;
  editable: boolean;
  completed: boolean;
  step: FormStepConfig;
}

export interface WizardProgressSummary {
  steps: readonly StepRuntimeSummary[];
  navigableIndices: readonly number[];
  completedCount: number;
  totalActiveSteps: number;
  progressPercent: number;
}

/**
 * Multi-Step Enterprise Workflow Controller managing conditional step visibility,
 * `skipWhen` automatic step skipping (forward & backward), role-based step permissions,
 * and step completion summaries.
 */
export class StepWorkflowController {
  private config: FormConfig;
  private completedStepIds = new Set<string>();

  constructor(config: FormConfig) {
    this.config = config;
  }

  public updateConfig(config: FormConfig): void {
    this.config = config;
  }

  public markStepCompleted(stepId: string, completed = true): void {
    if (completed) {
      this.completedStepIds.add(stepId);
    } else {
      this.completedStepIds.delete(stepId);
    }
  }

  private getRawSteps(): readonly FormStepConfig[] {
    return (
      this.config.steps ??
      this.config.fields?.find((f) => f.type === 'stepGroup')?.steps ??
      []
    );
  }

  public evaluateSteps(
    values: FormValues,
    actorRoles: readonly string[] = []
  ): WizardProgressSummary {
    const condCtx = { namedConditions: this.config.conditions };
    const raw = this.getRawSteps();
    const summaries: StepRuntimeSummary[] = [];
    const navigableIndices: number[] = [];

    raw.forEach((step, idx) => {
      const perm = evaluatePermissionRule(step.permissions, actorRoles);
      const visible =
        perm.canView &&
        (!step.visibleWhen || evaluateCondition(step.visibleWhen, values, condCtx));
      const skipped = Boolean(
        visible &&
          step.skipWhen &&
          evaluateCondition(step.skipWhen, values, condCtx)
      );

      if (visible && !skipped) {
        navigableIndices.push(idx);
      }

      summaries.push({
        id: step.id,
        index: idx,
        visible,
        skipped,
        editable: perm.canEdit,
        completed: this.completedStepIds.has(step.id),
        step,
      });
    });

    const totalActiveSteps = navigableIndices.length;
    const completedCount = summaries.filter(
      (s) => s.visible && !s.skipped && s.completed
    ).length;
    const progressPercent =
      totalActiveSteps === 0
        ? 100
        : Math.round((completedCount / totalActiveSteps) * 100);

    return {
      steps: summaries,
      navigableIndices,
      completedCount,
      totalActiveSteps,
      progressPercent,
    };
  }

  public findNextNavigableIndex(
    currentRawIndex: number,
    values: FormValues,
    actorRoles: readonly string[] = []
  ): number | null {
    const { navigableIndices } = this.evaluateSteps(values, actorRoles);
    for (const idx of navigableIndices) {
      if (idx > currentRawIndex) return idx;
    }
    return null;
  }

  public findPreviousNavigableIndex(
    currentRawIndex: number,
    values: FormValues,
    actorRoles: readonly string[] = []
  ): number | null {
    const { navigableIndices } = this.evaluateSteps(values, actorRoles);
    for (let i = navigableIndices.length - 1; i >= 0; i -= 1) {
      if (navigableIndices[i] < currentRawIndex) return navigableIndices[i];
    }
    return null;
  }
}
