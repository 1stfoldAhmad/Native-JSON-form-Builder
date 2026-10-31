import type { SubmissionLifecycleState } from '../types';

export interface SubmissionTransitionAuditEntry {
  from: SubmissionLifecycleState;
  to: SubmissionLifecycleState;
  actorId?: string;
  actorRoles?: readonly string[];
  reason?: string;
  comment?: string;
  timestamp: string;
}

export interface SubmissionLifecycleSnapshot {
  submissionId: string;
  formId: string;
  state: SubmissionLifecycleState;
  createdAt: string;
  updatedAt: string;
  history: readonly SubmissionTransitionAuditEntry[];
}

const VALID_LIFECYCLE_TRANSITIONS: Record<
  SubmissionLifecycleState,
  readonly SubmissionLifecycleState[]
> = {
  draft: ['in_progress', 'ready_for_submission', 'cancelled', 'archived'],
  in_progress: ['draft', 'ready_for_submission', 'submitted', 'cancelled'],
  ready_for_submission: ['in_progress', 'submitted', 'cancelled'],
  submitted: ['under_review', 'approved', 'rejected', 'cancelled'],
  under_review: ['approved', 'rejected', 'in_progress', 'cancelled'],
  approved: ['archived'],
  rejected: ['in_progress', 'cancelled', 'archived'],
  cancelled: ['draft', 'archived'],
  archived: [],
};

export function canTransitionSubmissionState(
  from: SubmissionLifecycleState,
  to: SubmissionLifecycleState
): boolean {
  return VALID_LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Deterministic 9-state Submission Lifecycle state machine with immutable audit history.
 * Decoupled from `FormRenderer` so backend/workflow orchestrators can run it headless or in UI.
 */
export class SubmissionLifecycleMachine {
  private snapshot: SubmissionLifecycleSnapshot;
  private listeners = new Set<(snap: SubmissionLifecycleSnapshot) => void>();
  private now: () => Date;

  constructor(options: {
    submissionId: string;
    formId: string;
    initialState?: SubmissionLifecycleState;
    now?: () => Date;
  }) {
    this.now = options.now ?? (() => new Date());
    const nowIso = this.now().toISOString();
    this.snapshot = {
      submissionId: options.submissionId,
      formId: options.formId,
      state: options.initialState ?? 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      history: [],
    };
  }

  public getState(): SubmissionLifecycleState {
    return this.snapshot.state;
  }

  public getSnapshot(): SubmissionLifecycleSnapshot {
    return {
      ...this.snapshot,
      history: [...this.snapshot.history],
    };
  }

  public getAllowedNextStates(): readonly SubmissionLifecycleState[] {
    return VALID_LIFECYCLE_TRANSITIONS[this.snapshot.state] ?? [];
  }

  public canTransitionTo(target: SubmissionLifecycleState): boolean {
    return canTransitionSubmissionState(this.snapshot.state, target);
  }

  public transitionTo(
    target: SubmissionLifecycleState,
    meta?: {
      actorId?: string;
      actorRoles?: readonly string[];
      reason?: string;
      comment?: string;
    }
  ): SubmissionLifecycleSnapshot {
    const from = this.snapshot.state;
    if (!this.canTransitionTo(target)) {
      throw new Error(
        `Invalid submission lifecycle transition from "${from}" to "${target}". Allowed: [${this.getAllowedNextStates().join(', ')}]`
      );
    }

    const nowIso = this.now().toISOString();
    const audit: SubmissionTransitionAuditEntry = {
      from,
      to: target,
      actorId: meta?.actorId,
      actorRoles: meta?.actorRoles,
      reason: meta?.reason,
      comment: meta?.comment,
      timestamp: nowIso,
    };

    this.snapshot = {
      ...this.snapshot,
      state: target,
      updatedAt: nowIso,
      history: [...this.snapshot.history, audit],
    };

    const nextSnap = this.getSnapshot();
    for (const fn of this.listeners) fn(nextSnap);
    return nextSnap;
  }

  public subscribe(
    listener: (snap: SubmissionLifecycleSnapshot) => void
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
