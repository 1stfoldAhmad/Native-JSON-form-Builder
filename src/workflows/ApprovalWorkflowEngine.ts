import type { ApprovalStageConfig } from '../types';
import { SubmissionLifecycleMachine } from './SubmissionLifecycle';

export type ApprovalDecisionAction =
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'reassign';

export interface ApprovalAuditRecord {
  stageId: string;
  action: ApprovalDecisionAction;
  actorId: string;
  actorRoles: readonly string[];
  assignedToActorId?: string;
  comment?: string;
  timestamp: string;
}

export interface ApprovalStageRuntimeState {
  stageId: string;
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'changes_requested';
  approvalsByActor: string[];
  requiredApprovals: number;
  assignedReviewerId?: string;
}

/**
 * Multi-stage enterprise approval & rejection workflow engine coordinating reviewer roles,
 * multi-approver quorums, comment enforcement on rejection, reassignment, and automatic
 * `SubmissionLifecycleMachine` state transitions.
 */
export class ApprovalWorkflowEngine {
  private stages: readonly ApprovalStageConfig[];
  private lifecycle: SubmissionLifecycleMachine;
  private stageStates: ApprovalStageRuntimeState[];
  private auditTrail: ApprovalAuditRecord[] = [];
  private now: () => Date;

  constructor(options: {
    stages: readonly ApprovalStageConfig[];
    lifecycle: SubmissionLifecycleMachine;
    now?: () => Date;
  }) {
    this.stages = options.stages;
    this.lifecycle = options.lifecycle;
    this.now = options.now ?? (() => new Date());
    this.stageStates = this.stages.map((s, idx) => ({
      stageId: s.id,
      status: idx === 0 ? 'active' : 'pending',
      approvalsByActor: [],
      requiredApprovals: Math.max(1, s.requiredApprovals ?? 1),
    }));
  }

  public getStageStates(): readonly ApprovalStageRuntimeState[] {
    return this.stageStates.map((s) => ({
      ...s,
      approvalsByActor: [...s.approvalsByActor],
    }));
  }

  public getActiveStage(): {
    config: ApprovalStageConfig;
    runtime: ApprovalStageRuntimeState;
  } | null {
    const idx = this.stageStates.findIndex((s) => s.status === 'active');
    if (idx < 0) return null;
    return {
      config: this.stages[idx],
      runtime: this.stageStates[idx],
    };
  }

  public getAuditTrail(): readonly ApprovalAuditRecord[] {
    return [...this.auditTrail];
  }

  private assertAuthorizedForActiveStage(
    actorRoles: readonly string[]
  ): {
    index: number;
    config: ApprovalStageConfig;
    runtime: ApprovalStageRuntimeState;
  } {
    const index = this.stageStates.findIndex((s) => s.status === 'active');
    if (index < 0) {
      throw new Error('No active approval stage is awaiting review.');
    }
    const config = this.stages[index];
    const runtime = this.stageStates[index];

    if (config.reviewerRoles && config.reviewerRoles.length > 0) {
      const roleSet = new Set(actorRoles);
      const allowed = config.reviewerRoles.some((r) => roleSet.has(r));
      if (!allowed) {
        throw new Error(
          `Actor roles [${actorRoles.join(', ')}] are not authorized to review stage "${config.id}" (requires [${config.reviewerRoles.join(', ')}]).`
        );
      }
    }

    return { index, config, runtime };
  }

  public submitForReview(meta?: {
    actorId?: string;
    actorRoles?: readonly string[];
  }): void {
    if (this.lifecycle.getState() === 'draft' || this.lifecycle.getState() === 'in_progress' || this.lifecycle.getState() === 'ready_for_submission') {
      this.lifecycle.transitionTo('submitted', meta);
    }
    if (this.lifecycle.getState() === 'submitted') {
      this.lifecycle.transitionTo('under_review', meta);
    }
  }

  public approve(input: {
    actorId: string;
    actorRoles: readonly string[];
    comment?: string;
  }): ApprovalAuditRecord {
    const { index, config, runtime } = this.assertAuthorizedForActiveStage(
      input.actorRoles
    );

    if (!runtime.approvalsByActor.includes(input.actorId)) {
      runtime.approvalsByActor.push(input.actorId);
    }

    const record: ApprovalAuditRecord = {
      stageId: config.id,
      action: 'approve',
      actorId: input.actorId,
      actorRoles: [...input.actorRoles],
      comment: input.comment,
      timestamp: this.now().toISOString(),
    };
    this.auditTrail.push(record);

    if (runtime.approvalsByActor.length >= runtime.requiredApprovals) {
      runtime.status = 'approved';
      const nextIdx = index + 1;
      if (nextIdx < this.stageStates.length) {
        this.stageStates[nextIdx].status = 'active';
      } else if (this.lifecycle.canTransitionTo('approved')) {
        this.lifecycle.transitionTo('approved', {
          actorId: input.actorId,
          actorRoles: input.actorRoles,
          comment: input.comment,
        });
      }
    }

    return record;
  }

  public reject(input: {
    actorId: string;
    actorRoles: readonly string[];
    comment?: string;
  }): ApprovalAuditRecord {
    const { config, runtime } = this.assertAuthorizedForActiveStage(
      input.actorRoles
    );

    if (
      config.requireCommentOnReject !== false &&
      (!input.comment || !input.comment.trim())
    ) {
      throw new Error(
        `Rejection on stage "${config.id}" requires a non-empty review comment.`
      );
    }

    runtime.status = 'rejected';
    const record: ApprovalAuditRecord = {
      stageId: config.id,
      action: 'reject',
      actorId: input.actorId,
      actorRoles: [...input.actorRoles],
      comment: input.comment,
      timestamp: this.now().toISOString(),
    };
    this.auditTrail.push(record);

    if (this.lifecycle.canTransitionTo('rejected')) {
      this.lifecycle.transitionTo('rejected', {
        actorId: input.actorId,
        actorRoles: input.actorRoles,
        comment: input.comment,
      });
    }

    return record;
  }

  public requestChanges(input: {
    actorId: string;
    actorRoles: readonly string[];
    comment: string;
  }): ApprovalAuditRecord {
    const { config, runtime } = this.assertAuthorizedForActiveStage(
      input.actorRoles
    );
    if (!input.comment.trim()) {
      throw new Error('Requesting changes requires a reviewer comment.');
    }

    runtime.status = 'changes_requested';
    runtime.approvalsByActor = [];
    const record: ApprovalAuditRecord = {
      stageId: config.id,
      action: 'request_changes',
      actorId: input.actorId,
      actorRoles: [...input.actorRoles],
      comment: input.comment,
      timestamp: this.now().toISOString(),
    };
    this.auditTrail.push(record);

    if (this.lifecycle.canTransitionTo('in_progress')) {
      this.lifecycle.transitionTo('in_progress', {
        actorId: input.actorId,
        actorRoles: input.actorRoles,
        comment: input.comment,
      });
    }

    return record;
  }

  public reassign(input: {
    actorId: string;
    actorRoles: readonly string[];
    assignToActorId: string;
    comment?: string;
  }): ApprovalAuditRecord {
    const { config, runtime } = this.assertAuthorizedForActiveStage(
      input.actorRoles
    );
    if (config.allowReassign === false) {
      throw new Error(`Stage "${config.id}" does not permit reviewer reassignment.`);
    }

    runtime.assignedReviewerId = input.assignToActorId;
    const record: ApprovalAuditRecord = {
      stageId: config.id,
      action: 'reassign',
      actorId: input.actorId,
      actorRoles: [...input.actorRoles],
      assignedToActorId: input.assignToActorId,
      comment: input.comment,
      timestamp: this.now().toISOString(),
    };
    this.auditTrail.push(record);
    return record;
  }
}
