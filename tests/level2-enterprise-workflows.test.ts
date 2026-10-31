import { describe, expect, it, vi } from 'vitest';

import {
  ApprovalWorkflowEngine,
  DefaultConnectivityAdapter,
  DraftManager,
  FormStore,
  OfflineSubmissionQueue,
  RemoteDraftSyncController,
  RemoteSchemaManager,
  SchemaVersionRegistry,
  StepWorkflowController,
  SubmissionLifecycleMachine,
  defineFormConfig,
  evaluatePermissionRule,
  extractServerPermissionManifest,
  type DraftStorageAdapter,
} from '../src';

function createMemoryStorage(): DraftStorageAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

describe('Level 2 (Phase 3) — Enterprise Form Workflows, Offline Sync, Lifecycle & Versioning', () => {
  it('manages versioned drafts with expiration, non-overridable secret scrubbing, and multi-hop SchemaVersionRegistry migration', async () => {
    let nowMs = Date.parse('2026-10-31T10:00:00.000Z');
    const storage = createMemoryStorage();
    const versionRegistry = new SchemaVersionRegistry();

    versionRegistry.registerMigration({
      formId: 'vehicle-reg',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      migrate: (data) => ({
        ...data,
        ownerFullName: `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
      }),
    });
    versionRegistry.registerMigration({
      formId: 'vehicle-reg',
      fromVersion: '1.1.0',
      toVersion: '2.0.0',
      migrate: (data) => ({
        ...data,
        registrationCategory: data.isCommercial ? 'commercial' : 'private',
      }),
    });

    const v1Config = defineFormConfig({
      id: 'vehicle-reg',
      version: '1.0.0',
      draft: { enabled: true, maxAgeMs: 60_000, excludeSensitive: false },
      security: { protectSensitiveFields: false },
      fields: [
        { name: 'firstName', type: 'text' },
        { name: 'lastName', type: 'text' },
        { name: 'isCommercial', type: 'checkbox' },
        { name: 'pinCode', type: 'pin' },
      ],
    });

    const v1DraftMgr = new DraftManager({
      config: v1Config,
      storageAdapter: storage,
      versionRegistry,
      now: () => new Date(nowMs),
    });

    const saved = await v1DraftMgr.saveDraft(
      {
        firstName: 'Ahmad',
        lastName: 'Khan',
        isCommercial: true,
        pinCode: '9988',
      },
      { currentStepIndex: 1 }
    );

    // Built-in secret `pin` MUST NEVER be persisted even when excludeSensitive=false!
    expect(saved.values.pinCode).toBeUndefined();
    expect(saved.values.firstName).toBe('Ahmad');

    // Upgrade form to v2.0.0 and verify automatic 1.0.0 -> 1.1.0 -> 2.0.0 migration!
    const v2Config = defineFormConfig({
      id: 'vehicle-reg',
      version: '2.0.0',
      draft: { enabled: true, maxAgeMs: 60_000 },
      fields: [
        { name: 'ownerFullName', type: 'text' },
        { name: 'registrationCategory', type: 'text' },
      ],
    });

    nowMs += 10_000;
    const v2DraftMgr = new DraftManager({
      config: v2Config,
      storageAdapter: storage,
      versionRegistry,
      now: () => new Date(nowMs),
    });

    const loaded = await v2DraftMgr.loadDraft();
    expect(loaded.restored).toBe(true);
    expect(loaded.migrated).toBe(true);
    expect(loaded.values?.ownerFullName).toBe('Ahmad Khan');
    expect(loaded.values?.registrationCategory).toBe('commercial');

    // Advance past 60s expiration -> draft is discarded and removed from storage
    nowMs += 120_000;
    const expired = await v2DraftMgr.loadDraft();
    expect(expired.restored).toBe(false);
    expect(expired.expired).toBe(true);
    expect(storage.store.size).toBe(0);
  });

  it('queues offline submissions with idempotency keys, uploads attachments first, and auto-syncs on reconnect', async () => {
    const storage = createMemoryStorage();
    const connectivity = new DefaultConnectivityAdapter(false);
    const uploadedFiles: string[] = [];
    const submittedPayloads: Array<{ idempotencyKey: string; vin: unknown }> = [];

    let failFirstSubmit = true;
    const queue = new OfflineSubmissionQueue({
      storageAdapter: storage,
      connectivity,
      baseBackoffMs: 0,
      uploadAttachment: async (entry) => {
        uploadedFiles.push(entry.asset.name);
        return { remoteUrl: `https://cdn.example.com/${entry.asset.name}` };
      },
      submitRecord: async (record) => {
        if (failFirstSubmit) {
          failFirstSubmit = false;
          return { ok: false, errorMessage: '503 Gateway Busy' };
        }
        submittedPayloads.push({
          idempotencyKey: record.idempotencyKey,
          vin: record.values.vin,
        });
        return { ok: true };
      },
    });

    // Enqueue while offline -> stays 'queued' in durable storage
    const rec = await queue.enqueue({
      formId: 'inspection-form',
      idempotencyKey: 'idem_veh_001',
      values: { vin: 'PK-VIN-2026', inspectorSecretPin: '1234' },
      sensitivePathsToOmit: new Set(['inspectorSecretPin']),
      filesByField: {
        chassisPhoto: [
          {
            id: 'asset_chassis_1',
            uri: 'file:///chassis.jpg',
            name: 'chassis.jpg',
            mimeType: 'image/jpeg',
            size: 2048,
          },
        ],
      },
    });

    expect(rec.status).toBe('queued');
    expect(rec.values.inspectorSecretPin).toBeUndefined();
    expect(submittedPayloads.length).toBe(0);

    // Duplicate enqueue with identical idempotencyKey is deduplicated
    const dup = await queue.enqueue({
      formId: 'inspection-form',
      idempotencyKey: 'idem_veh_001',
      values: { vin: 'PK-VIN-2026' },
    });
    expect(dup.id).toBe(rec.id);
    expect((await queue.getItems()).length).toBe(1);

    // Reconnect online -> first sync uploads attachment once, hits transient 503 -> 'failed_retryable'
    connectivity.setOnline(true);
    await vi.waitFor(async () => {
      const items = await queue.getItems();
      expect(items[0].status).toBe('failed_retryable');
    });
    expect(uploadedFiles).toEqual(['chassis.jpg']);

    // Retry item -> attachment is ALREADY 'uploaded' (not re-uploaded!), payload succeeds!
    const retried = await queue.retryItem(rec.id);
    expect(retried?.status).toBe('synced');
    expect(uploadedFiles).toEqual(['chassis.jpg']);
    expect(submittedPayloads).toEqual([
      { idempotencyKey: 'idem_veh_001', vin: 'PK-VIN-2026' },
    ]);

    queue.dispose();
    connectivity.dispose();
  });

  it('drives 9-state SubmissionLifecycleMachine, multi-stage ApprovalWorkflowEngine, RBAC permissions, and cross-device draft sync', async () => {
    const lifecycle = new SubmissionLifecycleMachine({
      submissionId: 'sub_900',
      formId: 'fleet-approval',
      initialState: 'draft',
    });

    expect(lifecycle.canTransitionTo('approved')).toBe(false);
    lifecycle.transitionTo('in_progress', { actorId: 'applicant_1' });
    lifecycle.transitionTo('ready_for_submission', { actorId: 'applicant_1' });

    const workflow = new ApprovalWorkflowEngine({
      lifecycle,
      stages: [
        {
          id: 'inspector_review',
          title: 'Inspector Verification',
          reviewerRoles: ['inspector'],
          requiredApprovals: 2,
          requireCommentOnReject: true,
        },
        {
          id: 'registrar_signoff',
          title: 'Registrar Final Sign-off',
          reviewerRoles: ['registrar'],
          allowReassign: false,
        },
      ],
    });

    workflow.submitForReview({ actorId: 'applicant_1' });
    expect(lifecycle.getState()).toBe('under_review');

    // Unauthorized role cannot approve inspector stage
    expect(() =>
      workflow.approve({ actorId: 'clerk_1', actorRoles: ['clerk'] })
    ).toThrow(/not authorized/);

    // Stage 1 requires 2 inspector approvals
    workflow.approve({
      actorId: 'insp_1',
      actorRoles: ['inspector'],
      comment: 'Chassis verified',
    });
    expect(workflow.getActiveStage()?.config.id).toBe('inspector_review');

    workflow.approve({
      actorId: 'insp_2',
      actorRoles: ['inspector'],
      comment: 'Emission test passed',
    });
    expect(workflow.getActiveStage()?.config.id).toBe('registrar_signoff');

    // Stage 2 disallows reassignment and requires comment on rejection
    expect(() =>
      workflow.reassign({
        actorId: 'reg_1',
        actorRoles: ['registrar'],
        assignToActorId: 'reg_2',
      })
    ).toThrow(/does not permit reviewer reassignment/);

    expect(() =>
      workflow.reject({ actorId: 'reg_1', actorRoles: ['registrar'], comment: '' })
    ).toThrow(/requires a non-empty review comment/);

    workflow.approve({
      actorId: 'reg_1',
      actorRoles: ['registrar'],
      comment: 'Registration certificate issued',
    });

    expect(lifecycle.getState()).toBe('approved');
    expect(workflow.getAuditTrail().length).toBe(3);

    // Archive completed submission
    lifecycle.transitionTo('archived', { actorId: 'system' });
    expect(lifecycle.getState()).toBe('archived');
    expect(lifecycle.getSnapshot().history.length).toBe(6);

    // RBAC permissions & server manifest extraction
    const permConfig = defineFormConfig({
      id: 'rbac-demo',
      permissions: { allowedRoles: ['applicant', 'inspector'] },
      fields: [
        {
          name: 'inspectorNotes',
          type: 'textarea',
          permissions: {
            visibleForRoles: ['inspector', 'registrar'],
            editableForRoles: ['inspector'],
            requiredForRoles: ['inspector'],
          },
        },
      ],
    });

    expect(
      evaluatePermissionRule(permConfig.fields![0].permissions, ['applicant']).canView
    ).toBe(false);
    const registrarPerm = evaluatePermissionRule(
      permConfig.fields![0].permissions,
      ['registrar']
    );
    expect(registrarPerm.canView).toBe(true);
    expect(registrarPerm.isReadOnly).toBe(true);

    const manifest = extractServerPermissionManifest(permConfig);
    expect(manifest.length).toBe(2);

    // Cross-device remote draft conflict resolution ('newest-wins')
    const remoteController = new RemoteDraftSyncController({
      sensitivePaths: new Set(['otpCode']),
      transport: {
        saveRemoteDraft: async (snap) => ({
          ...snap,
          resumeToken: snap.resumeToken ?? 'tok_resume_1',
        }),
        fetchRemoteDraft: async () => ({
          resumeToken: 'tok_resume_1',
          formId: 'rbac-demo',
          schemaVersion: '1.0.0',
          currentStepIndex: 2,
          values: { plate: 'REMOTE-999', otpCode: '000111' },
          updatedAt: '2026-10-31T12:00:00.000Z',
        }),
      },
    });

    const resolvedDraft = await remoteController.pullAndResolveDraft('tok_resume_1', {
      resumeToken: 'tok_resume_1',
      formId: 'rbac-demo',
      schemaVersion: '1.0.0',
      currentStepIndex: 1,
      values: { plate: 'LOCAL-111' },
      updatedAt: '2026-10-31T11:00:00.000Z',
    });
    expect(resolvedDraft?.values.plate).toBe('REMOTE-999');
    expect(resolvedDraft?.values.otpCode).toBeUndefined();
  });

  it('supports conditional step skipping (skipWhen) and validates remote schemas before activation', async () => {
    const wizardConfig = defineFormConfig({
      id: 'wizard-skip-test',
      steps: [
        {
          id: 'step_vehicle',
          title: 'Vehicle Info',
          fields: [{ name: 'isElectric', type: 'checkbox', defaultValue: true }],
        },
        {
          id: 'step_emissions',
          title: 'Exhaust Emissions',
          skipWhen: { field: 'isElectric', operator: 'equals', value: true },
          fields: [{ name: 'co2Grams', type: 'number', required: true }],
        },
        {
          id: 'step_summary',
          title: 'Summary',
          fields: [{ name: 'ownerName', type: 'text' }],
        },
      ],
    });

    const stepCtrl = new StepWorkflowController(wizardConfig);
    stepCtrl.markStepCompleted('step_vehicle');
    const summary = stepCtrl.evaluateSteps({ isElectric: true });
    expect(summary.navigableIndices).toEqual([0, 2]);
    expect(summary.progressPercent).toBe(50);

    // FormStore.nextStep() & previousStep() skip `step_emissions` seamlessly!
    const store = new FormStore({ config: wizardConfig });
    expect(store.getCurrentStepIndex()).toBe(0);
    await store.nextStep();
    expect(store.getCurrentStepIndex()).toBe(2);
    store.previousStep();
    expect(store.getCurrentStepIndex()).toBe(0);

    // RemoteSchemaManager rejects invalid/incompatible remote schemas & falls back safely
    const storage = createMemoryStorage();
    const fallback = defineFormConfig({
      id: 'remote-test',
      fields: [{ name: 'safeField', type: 'text' }],
    });

    const badRemoteMgr = new RemoteSchemaManager({
      storageAdapter: storage,
      engineVersion: '1.1.0',
      fetcher: async () => ({
        status: 200,
        etag: '"v-bad"',
        body: {
          id: 'remote-test',
          fields: [{ name: 'badCalc', type: 'calculated', formula: 'eval("pwn")' }],
        },
      }),
    });

    const fallbackResolved = await badRemoteMgr.loadSchema({
      formId: 'remote-test',
      url: 'https://schemas.example.com/remote-test.json',
      fallbackConfig: fallback,
    });
    expect(fallbackResolved.source).toBe('fallback');
    expect(fallbackResolved.warnings[0]).toMatch(/Rejected invalid remote schema/);
  });
});
