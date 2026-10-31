import React, { createRef, useState } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import vehicleRegistrationJson from '../forms/vehicle-registration-enterprise.json';
import {
  ApprovalWorkflowEngine,
  buildServerUploadPolicyManifest,
  compileFormSchema,
  DefaultConnectivityAdapter,
  DraftManager,
  ExpoForm,
  ExpoFormProvider,
  extractServerPermissionManifest,
  FormStore,
  inspectFormRuntime,
  MAX_REGEX_INPUT_LENGTH,
  OfflineSubmissionQueue,
  parseAndValidateFormConfig,
  PathSubscriptionIndex,
  PerformanceProfiler,
  REDACTED_SENSITIVE_TOKEN,
  RemoteSchemaManager,
  StepWorkflowController,
  SubmissionLifecycleMachine,
  type DraftStorageAdapter,
  type ExpoFormRef,
  type FormConfig,
  type FormFileAsset,
  type FormValues,
} from '../src';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

describe('Technical Audit (2026-10-31) — P0–P3 Stabilization & Enterprise Verification', () => {
  // =========================================================================
  // P0 — End-to-End Submission, Validation & Step-Transition Race Integrity
  // =========================================================================
  describe('P0: Async Validation, Submission & Step-Transition Race Integrity', () => {
    it('prevents stale unvalidated payloads from reaching onSubmit when an async field mutates mid-flight to an invalid value', async () => {
      const firstCheck = createDeferred<boolean | string>();
      const asyncCalls: string[] = [];

      const asyncUsernameCheck = vi.fn(async (ctx: { value: unknown }) => {
        const str = String(ctx.value ?? '');
        asyncCalls.push(str);
        if (str === 'alice_ok') {
          return firstCheck.promise;
        }
        if (str === 'taken_admin') {
          return 'Username is reserved';
        }
        return true;
      });

      const onSubmit = vi.fn();
      const config: FormConfig = {
        id: 'p0-submit-race-invalid',
        fields: [
          {
            name: 'username',
            type: 'username',
            required: true,
            validation: {
              async: {
                validatorId: 'checkUsername',
                debounceMs: 0,
              },
            },
          },
        ],
      };

      const store = new FormStore({
        config,
        initialValues: { username: 'alice_ok' },
        asyncValidators: { checkUsername: asyncUsernameCheck },
        callbacks: { onSubmit },
      });

      const submitPromise = store.submit();
      await Promise.resolve();

      // Mutate field to an invalid value while the initial async validation is still in flight
      store.setValue('username', 'taken_admin');
      firstCheck.resolve(true);

      const submitted = await submitPromise;
      expect(submitted).toBe(false);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(asyncCalls).toContain('taken_admin');
      expect(store.getRawError('username')).toBe('Username is reserved');
    });

    it('re-validates and submits ONLY the exact verified snapshot when a field mutates mid-flight to a new valid value', async () => {
      const firstCheck = createDeferred<boolean | string>();
      const validatedSnapshots: string[] = [];
      const submittedPayloads: FormValues[] = [];

      const store = new FormStore({
        config: {
          id: 'p0-submit-race-reverify',
          fields: [
            {
              name: 'handle',
              type: 'text',
              required: true,
              validation: {
                async: { validatorId: 'verifyHandle', debounceMs: 0 },
              },
            },
          ],
        },
        initialValues: { handle: 'initial_handle' },
        asyncValidators: {
          verifyHandle: async (ctx) => {
            const s = String(ctx.value ?? '');
            validatedSnapshots.push(s);
            if (s === 'initial_handle') {
              return firstCheck.promise;
            }
            return true;
          },
        },
        callbacks: {
          onSubmit: (values: FormValues) => {
            submittedPayloads.push(values);
          },
        },
      });

      const submitPromise = store.submit();
      await Promise.resolve();

      // User edits field to a new valid handle mid-flight
      store.setValue('handle', 'updated_verified_handle');
      firstCheck.resolve(true);

      const ok = await submitPromise;
      expect(ok).toBe(true);
      expect(validatedSnapshots[0]).toBe('initial_handle');
      expect(validatedSnapshots.at(-1)).toBe('updated_verified_handle');
      expect(submittedPayloads).toEqual([{ handle: 'updated_verified_handle' }]);
    });

    it('fails closed when an async-validated field continuously mutates across every retry pass', async () => {
      let passCount = 0;
      const onSubmit = vi.fn();

      const store = new FormStore({
        config: {
          id: 'p0-continuous-mutation-fail-closed',
          fields: [
            {
              name: 'email',
              type: 'email',
              required: true,
              validation: {
                async: { validatorId: 'verifyEmail', debounceMs: 0 },
              },
            },
          ],
        },
        initialValues: { email: 'v0@example.com' },
        asyncValidators: {
          verifyEmail: async () => {
            passCount += 1;
            // Mutate store value during every async pass so no snapshot ever stabilizes
            store.setValue('email', `v${passCount}@example.com`);
            return true;
          },
        },
        callbacks: { onSubmit },
      });

      const ok = await store.submit();
      expect(ok).toBe(false);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(store.getRawError('email')).toMatch(
        /validation in progress|verification/i
      );
    });

    it('aborts in-flight submit() cleanly if reset() occurs mid-flight', async () => {
      const gate = createDeferred<boolean | string>();
      const onSubmit = vi.fn();

      const store = new FormStore({
        config: {
          id: 'form-v1',
          fields: [
            {
              name: 'code',
              type: 'text',
              required: true,
              validation: {
                async: { validatorId: 'checkCode', debounceMs: 0 },
              },
            },
          ],
        },
        initialValues: { code: 'ABC-123' },
        asyncValidators: { checkCode: () => gate.promise },
        callbacks: { onSubmit },
      });

      const submitPromise = store.submit();
      await Promise.resolve();

      store.reset({ code: 'RESET-999' });
      gate.resolve(true);

      expect(await submitPromise).toBe(false);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('blocks nextStep() when an async-validated field on the active step mutates mid-flight to an invalid value', async () => {
      const gate = createDeferred<boolean | string>();

      const store = new FormStore({
        config: {
          id: 'p0-wizard-step-race',
          steps: [
            {
              id: 'step-account',
              title: 'Account',
              validateBeforeNext: true,
              fields: [
                {
                  name: 'inviteCode',
                  type: 'text',
                  required: true,
                  validation: {
                    async: { validatorId: 'verifyInvite', debounceMs: 0 },
                  },
                },
              ],
            },
            {
              id: 'step-confirm',
              title: 'Confirm',
              fields: [{ name: 'notes', type: 'text' }],
            },
          ],
        },
        initialValues: { inviteCode: 'VALID-INVITE' },
        asyncValidators: {
          verifyInvite: async (ctx) => {
            if (ctx.value === 'VALID-INVITE') return gate.promise;
            return 'Expired invite code';
          },
        },
      });

      const nextPromise = store.nextStep();
      await Promise.resolve();

      store.setValue('inviteCode', 'EXPIRED-CODE');
      gate.resolve(true);

      const advanced = await nextPromise;
      expect(advanced).toBe(false);
      expect(store.getCurrentStepIndex()).toBe(0);
      expect(store.getRawError('inviteCode')).toBe('Expired invite code');
    });

    it('enforces external loading={true} on imperative ref.submit() and ref.nextStep()', async () => {
      const onSubmit = vi.fn();
      const formRef = createRef<ExpoFormRef>();

      render(
        <ExpoForm
          ref={formRef}
          loading={true}
          onSubmit={onSubmit}
          config={{
            id: 'external-loading-guard',
            steps: [
              {
                id: 's1',
                title: 'Step 1',
                fields: [{ name: 'name', type: 'text', defaultValue: 'Ahmad' }],
              },
              {
                id: 's2',
                title: 'Step 2',
                fields: [{ name: 'city', type: 'text', defaultValue: 'Lahore' }],
              },
            ],
          }}
        />
      );

      let submitOk = true;
      let stepOk = true;
      await act(async () => {
        stepOk = await formRef.current!.nextStep();
        submitOk = await formRef.current!.submit();
      });

      expect(stepOk).toBe(false);
      expect(submitOk).toBe(false);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // P1 Finding 3 — Dynamic initialValues Lifecycle Synchronization
  // =========================================================================
  describe('P1 Finding 3: Dynamic initialValues Lifecycle Synchronization', () => {
    it('preserves dirty user edits across ordinary parent re-renders while supporting resetKey, config.id swaps, and enableReinitialize + keepDirtyOnReinitialize', () => {
      const formRef = createRef<ExpoFormRef>();

      const baseConfig: FormConfig = {
        id: 'profile-editor',
        fields: [
          { name: 'fullName', type: 'text', label: 'Full Name' },
          { name: 'department', type: 'text', label: 'Department' },
        ],
      };

      function HostHarness() {
        const [unrelatedTick, setUnrelatedTick] = useState(0);
        const [resetKey, setResetKey] = useState('record-1');
        const [enableReinit, setEnableReinit] = useState(false);
        const [keepDirty, setKeepDirty] = useState(false);
        const [activeConfig, setActiveConfig] = useState<FormConfig>(baseConfig);
        const [serverValues, setServerValues] = useState({
          fullName: 'Ayesha Khan',
          department: 'Engineering',
        });

        return (
          <>
            <button
              data-testid="rerender-parent"
              onClick={() => setUnrelatedTick((n) => n + 1)}
            >
              Tick {unrelatedTick}
            </button>
            <button
              data-testid="bump-reset-key"
              onClick={() => {
                setServerValues({ fullName: 'Bilal Raza', department: 'Finance' });
                setResetKey('record-2');
              }}
            />
            <button
              data-testid="enable-reinit-keep-dirty"
              onClick={() => {
                setEnableReinit(true);
                setKeepDirty(true);
              }}
            />
            <button
              data-testid="push-server-values"
              onClick={() =>
                setServerValues({
                  fullName: 'Server Override Ignored For Dirty',
                  department: 'Platform Security',
                })
              }
            />
            <button
              data-testid="swap-config-id"
              onClick={() => {
                setActiveConfig({ ...baseConfig, id: 'profile-editor-v2' });
                setServerValues({ fullName: 'Zainab Ali', department: 'Legal' });
              }}
            />
            <ExpoForm
              ref={formRef}
              config={activeConfig}
              // New inline object literal on every render — must NOT clobber dirty edits!
              initialValues={{ ...serverValues }}
              resetKey={resetKey}
              enableReinitialize={enableReinit}
              keepDirtyOnReinitialize={keepDirty}
            />
          </>
        );
      }

      const { getByTestId } = render(<HostHarness />);
      expect(formRef.current!.getValues()).toEqual({
        fullName: 'Ayesha Khan',
        department: 'Engineering',
      });

      // User modifies fullName
      act(() => {
        formRef.current!.setValue('fullName', 'Ayesha K. (Edited)');
      });

      // 1. Ordinary parent re-render with fresh inline initialValues object literal
      fireEvent.click(getByTestId('rerender-parent'));
      expect(formRef.current!.getValue('fullName')).toBe('Ayesha K. (Edited)');

      // 2. Explicit resetKey change resets form to new record's initialValues
      fireEvent.click(getByTestId('bump-reset-key'));
      expect(formRef.current!.getValues()).toEqual({
        fullName: 'Bilal Raza',
        department: 'Finance',
      });
      expect(formRef.current!.getState().isDirty).toBe(false);

      // 3. enableReinitialize + keepDirtyOnReinitialize preserves dirty fields while updating clean fields
      act(() => {
        formRef.current!.setValue('fullName', 'Bilal Custom Dirty Name');
      });
      fireEvent.click(getByTestId('enable-reinit-keep-dirty'));
      fireEvent.click(getByTestId('push-server-values'));

      expect(formRef.current!.getValues()).toEqual({
        fullName: 'Bilal Custom Dirty Name',
        department: 'Platform Security',
      });

      // 4. Changing config.id re-hydrates cleanly from the new config + latest initialValues
      fireEvent.click(getByTestId('swap-config-id'));
      expect(formRef.current!.getValues()).toEqual({
        fullName: 'Zainab Ali',
        department: 'Legal',
      });
    });
  });

  // =========================================================================
  // P1 Finding 4 — Same-ID Live Schema Reconciliation
  // =========================================================================
  describe('P1 Finding 4: Same-ID Schema Reconciliation (added, removed, renamed, modified)', () => {
    it('reconciles added, removed, renamed, and modified fields while pruning obsolete values, errors, dirty/touched flags, repeater keys, and invalid uploads', () => {
      const initialConfig: FormConfig = {
        id: 'live-studio-form',
        fields: [
          { name: 'legacyTitle', type: 'text', required: true },
          { name: 'obsoleteNote', type: 'textarea' },
          { name: 'quantity', type: 'text' },
          {
            name: 'planTier',
            type: 'select',
            options: [
              { label: 'Starter', value: 'starter' },
              { label: 'Legacy Pro', value: 'legacy_pro' },
            ],
          },
          {
            name: 'lineItems',
            type: 'repeater',
            maxItems: 5,
            fields: [
              { name: 'sku', type: 'text' },
              { name: 'deprecatedCode', type: 'text' },
            ],
          },
          {
            name: 'attachments',
            type: 'multipleFiles',
            upload: {
              maxFiles: 3,
              allowedMimeTypes: ['application/pdf', 'image/png'],
            },
          },
        ],
      };

      const store = new FormStore({
        config: initialConfig,
        initialValues: {
          legacyTitle: 'Q4 Procurement',
          obsoleteNote: 'Remove me when schema updates',
          quantity: '42',
          planTier: 'legacy_pro',
          lineItems: [
            { sku: 'SKU-1', deprecatedCode: 'OLD-1' },
            { sku: 'SKU-2', deprecatedCode: 'OLD-2' },
            { sku: 'SKU-3', deprecatedCode: 'OLD-3' },
          ],
        },
      });

      store.setValue('legacyTitle', 'Q4 Procurement Updated');
      store.setError('obsoleteNote', 'Stale error to prune');
      store.setError('legacyTitle', 'Migrate this error to requestTitle');

      const pdfAsset: FormFileAsset = {
        id: 'file-1',
        name: 'invoice.pdf',
        uri: 'file:///invoice.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'selected',
      };
      const pngAsset: FormFileAsset = {
        id: 'file-2',
        name: 'receipt.png',
        uri: 'file:///receipt.png',
        mimeType: 'image/png',
        size: 2048,
        status: 'selected',
      };
      store.setFieldFiles('attachments', [pdfAsset, pngAsset]);

      const nextConfig: FormConfig = {
        id: 'live-studio-form',
        fields: [
          // Renamed from legacyTitle -> requestTitle
          { name: 'requestTitle', type: 'text', required: true },
          // Modified from text -> number ('42' coerces cleanly to 42)
          { name: 'quantity', type: 'number' },
          // Modified select options ('legacy_pro' is no longer allowed -> reset to defaultValue)
          {
            name: 'planTier',
            type: 'select',
            defaultValue: 'enterprise',
            options: [
              { label: 'Starter', value: 'starter' },
              { label: 'Enterprise', value: 'enterprise' },
            ],
          },
          // Modified repeater: maxItems reduced to 2 and deprecatedCode removed
          {
            name: 'lineItems',
            type: 'repeater',
            maxItems: 2,
            fields: [{ name: 'sku', type: 'text' }],
          },
          // Modified upload constraints: PDF only, maxFiles 1
          {
            name: 'attachments',
            type: 'file',
            upload: {
              maxFiles: 1,
              allowedMimeTypes: ['application/pdf'],
            },
          },
          // Newly added field with defaultValue
          {
            name: 'priorityLevel',
            type: 'select',
            defaultValue: 'high',
            options: [{ label: 'High', value: 'high' }],
          },
        ],
      };

      const report = store.reconcileSchema(nextConfig, {
        renamedFields: { legacyTitle: 'requestTitle' },
      });

      expect(report.renamedFields).toEqual([
        { from: 'legacyTitle', to: 'requestTitle' },
      ]);
      expect(report.removedFields).toContain('obsoleteNote');
      expect(report.removedFields).toContain('lineItems.*.deprecatedCode');
      expect(report.addedFields).toContain('priorityLevel');
      expect(report.modifiedFields).toContain('quantity');
      expect(report.modifiedFields).toContain('planTier');

      const values = store.getValues();
      expect('legacyTitle' in values).toBe(false);
      expect('obsoleteNote' in values).toBe(false);
      expect(values.requestTitle).toBe('Q4 Procurement Updated');
      expect(values.quantity).toBe(42);
      expect(values.planTier).toBe('enterprise');
      expect(values.priorityLevel).toBe('high');
      expect(values.lineItems).toEqual([{ sku: 'SKU-1' }, { sku: 'SKU-2' }]);

      // Metadata maps migrated & pruned cleanly
      const snap = store.getState();
      expect(snap.errors.obsoleteNote).toBeUndefined();
      expect(snap.errors.legacyTitle).toBeUndefined();
      expect(snap.errors.requestTitle).toBe('Migrate this error to requestTitle');
      expect(Boolean(snap.dirtyFields.requestTitle)).toBe(true);
      expect(Boolean(snap.dirtyFields.legacyTitle)).toBe(false);

      // Uploaded files pruned to match updated PDF-only maxFiles=1 constraint
      expect(snap.filesByField.attachments).toHaveLength(1);
      expect(snap.filesByField.attachments?.[0]).toMatchObject(pdfAsset);
    });
  });

  // =========================================================================
  // P1 Findings 1, 2, 6, 7 — Security Surfaces, Regex & Upload Manifest
  // =========================================================================
  describe('P1 Findings 1, 2, 6, 7: Sensitive Surfaces, Regex Entry Points & Server Upload Manifest', () => {
    it('enforces secret protection across drafts, offline queue, diagnostics, and parser warnings even when sensitive: false is set', async () => {
      const storage = createMemoryStorage();

      const rawConfig: FormConfig = {
        id: 'secret-surface-audit',
        version: '1.0.0',
        draft: { enabled: true, excludeSensitive: false },
        security: {
          protectSensitiveFields: false,
          sensitiveFields: ['taxSecretToken'],
        },
        fields: [
          { name: 'email', type: 'email' },
          // Attempt to opt out built-in secrets and security.sensitiveFields entry
          { name: 'userPassword', type: 'password', sensitive: false },
          { name: 'cardCvv', type: 'cvv', sensitive: false },
          { name: 'taxSecretToken', type: 'text', sensitive: false },
        ],
      };

      const parsed = parseAndValidateFormConfig(rawConfig);
      expect(parsed.valid).toBe(true);
      expect(parsed.warnings.length).toBeGreaterThanOrEqual(3);

      const store = new FormStore({
        config: rawConfig,
        initialValues: {
          email: 'security@1stfold.com',
          userPassword: 'SuperSecretPassword!99',
          cardCvv: '918',
          taxSecretToken: 'TOK-LIVE-SECRET',
        },
      });

      const compiledPlan = compileFormSchema(rawConfig);

      // 1. DraftManager omits built-in secrets even when excludeSensitive=false
      const drafts = new DraftManager({
        config: {
          ...rawConfig,
          draft: { enabled: true, excludeSensitive: true },
        },
        storageAdapter: storage,
      });
      await drafts.saveDraft(store.getValues());
      const loaded = await drafts.loadDraft();
      expect(loaded.envelope?.values).toEqual({ email: 'security@1stfold.com' });

      // 2. OfflineSubmissionQueue strips all sensitivePathsToOmit before storage
      const connectivity = new DefaultConnectivityAdapter(false);
      const queue = new OfflineSubmissionQueue({
        storageAdapter: storage,
        connectivity,
        submitRecord: async () => ({ ok: true }),
      });
      const item = await queue.enqueue({
        formId: rawConfig.id,
        values: store.getValues(),
        sensitivePathsToOmit: compiledPlan.sensitivePaths,
      });
      expect(item.values).toEqual({ email: 'security@1stfold.com' });
      queue.dispose();
      connectivity.dispose();

      // 3. Runtime diagnostics redact all protected secrets
      const diag = inspectFormRuntime(store);
      expect(diag.redactedValues).toEqual({
        email: 'security@1stfold.com',
        userPassword: REDACTED_SENSITIVE_TOKEN,
        cardCvv: REDACTED_SENSITIVE_TOKEN,
        taxSecretToken: REDACTED_SENSITIVE_TOKEN,
      });
    });

    it('rejects ReDoS patterns across validation.regex, scan.extractPattern, named conditions, step skipWhen, and RemoteSchemaManager', async () => {
      const evilRegex = '(a+)+$';

      // 1. Barcode scan.extractPattern + named conditions + step skipWhen
      const parsedScanAndCond = parseAndValidateFormConfig({
        id: 'redos-entry-points',
        conditions: {
          evilNamedCond: { field: 'code', matches: evilRegex },
        },
        steps: [
          {
            id: 's1',
            title: 'Step 1',
            skipWhen: { field: 'code', matches: evilRegex },
            fields: [
              {
                name: 'code',
                type: 'barcode',
                scan: { extractPattern: evilRegex },
              },
            ],
          },
        ],
      });

      expect(parsedScanAndCond.valid).toBe(false);
      const errorPaths = parsedScanAndCond.errors.map((e) => e.path);
      expect(errorPaths).toContain('config.conditions.evilNamedCond.matches');
      expect(errorPaths).toContain('config.steps[0].skipWhen.matches');
      expect(errorPaths).toContain('config.steps[0].fields[0].scan.extractPattern');

      // 2. RemoteSchemaManager blocks unsafe remote schemas before caching or activating
      const remoteStorage = createMemoryStorage();
      const remoteMgr = new RemoteSchemaManager({
        engineVersion: '2.0.0',
        storageAdapter: remoteStorage,
        fetcher: async () => ({
          status: 200,
          body: {
            id: 'remote-evil',
            fields: [
              {
                name: 'token',
                type: 'text',
                validation: { regex: evilRegex },
              },
            ],
          },
        }),
      });

      await expect(
        remoteMgr.loadSchema({
          formId: 'remote-evil',
          url: 'https://schemas.example.com/evil.json',
        })
      ).rejects.toThrow(/unsafe|ReDoS|invalid/i);
      expect(remoteStorage.store.size).toBe(0);

      // 3. BarcodeScannerFieldRenderer fails closed on oversized scan inputs (> MAX_REGEX_INPUT_LENGTH)
      const formRef = createRef<ExpoFormRef>();
      const { getByPlaceholderText } = render(
        <ExpoForm
          ref={formRef}
          config={{
            id: 'barcode-length-guard',
            fields: [
              {
                name: 'serial',
                type: 'barcode',
                placeholder: 'Scan serial',
                scan: { extractPattern: '^SN-([0-9]+)$' },
              },
            ],
          }}
        />
      );

      const input = getByPlaceholderText('Scan serial');
      fireEvent.change(input, {
        target: { value: `SN-${'9'.repeat(MAX_REGEX_INPUT_LENGTH + 10)}` },
      });
      fireEvent.blur(input);

      expect(formRef.current!.getValue('serial')).toBeUndefined();
      expect(formRef.current!.getState().errors.serial).toMatch(
        /maximum safe pattern length/i
      );
    });

    it('exports a complete server-side upload & RBAC verification manifest from FormConfig', () => {
      const config: FormConfig = {
        id: 'kyc-upload-policy-audit',
        fields: [
          {
            name: 'passportPdf',
            type: 'file',
            permissions: {
              visibleForRoles: ['applicant', 'compliance_officer'],
              editableForRoles: ['applicant'],
            },
            upload: {
              allowedMimeTypes: ['application/pdf'],
              allowedExtensions: ['.pdf'],
              maxFileSize: 5 * 1024 * 1024,
              maxFiles: 1,
            },
          },
          {
            name: 'supportingDocs',
            type: 'repeater',
            fields: [
              {
                name: 'pageScan',
                type: 'documentScan',
                upload: { maxFileSize: 10 * 1024 * 1024 },
              },
            ],
          },
        ],
      };

      const uploadManifest = buildServerUploadPolicyManifest(config);
      expect(uploadManifest).toHaveLength(2);
      expect(uploadManifest[0]).toMatchObject({
        fieldPath: 'passportPdf',
        fieldType: 'file',
        allowedMimeTypes: ['application/pdf'],
        maxFileSize: 5 * 1024 * 1024,
        maxFiles: 1,
        requiredServerChecks: [
          'authenticatedSession',
          'magicByteSniffing',
          'contentLengthLimit',
          'serverGeneratedStorageKey',
          'malwareScan',
        ],
      });
      expect(uploadManifest[1]?.fieldPath).toBe('supportingDocs[].pageScan');

      const rbacManifest = extractServerPermissionManifest(config);
      expect(
        rbacManifest.find((m) => m.targetId === 'passportPdf')?.permissions
          .editableForRoles
      ).toEqual(['applicant']);
    });
  });

  // =========================================================================
  // P2 Finding 5 & P3 — O(depth) PathSubscriptionIndex & Runtime Benchmarks
  // =========================================================================
  describe('P2 Finding 5 & P3: O(depth) Subscription Index & Performance Benchmarks', () => {
    it('notifies exact, ancestor, and descendant listeners in O(depth + matching) without scanning 1,500 unrelated subscribed paths', () => {
      const index = new PathSubscriptionIndex();
      const hitPaths: string[] = [];
      const unsubscribes: (() => void)[] = [];

      // Subscribe 1,500 distinct flat & nested field paths
      for (let i = 0; i < 1500; i += 1) {
        const path = `section_${Math.floor(i / 50)}.field_${i}`;
        unsubscribes.push(
          index.subscribe([path], () => {
            hitPaths.push(path);
          })
        );
      }

      // Also subscribe an ancestor object path and a deep child path
      unsubscribes.push(
        index.subscribe(['section_15'], () => {
          hitPaths.push('ANCESTOR:section_15');
        })
      );
      unsubscribes.push(
        index.subscribe(['section_15.field_750.meta'], () => {
          hitPaths.push('DESCENDANT:section_15.field_750.meta');
        })
      );

      const toCall = new Set<() => void>();
      const bucketsInspected = index.collectHierarchy('section_15.field_750', toCall);
      for (const fn of toCall) fn();

      // Exact + 1 ancestor ('section_15') + 1 matching descendant ('section_15.field_750.meta') = 3 buckets!
      expect(bucketsInspected).toBe(3);
      expect(hitPaths.sort()).toEqual([
        'ANCESTOR:section_15',
        'DESCENDANT:section_15.field_750.meta',
        'section_15.field_750',
      ]);

      // Unsubscribing all listeners cleans up 100% of exact and prefix buckets
      for (const unsub of unsubscribes) unsub();
      expect(index.getStats()).toEqual({
        subscribedPathCount: 0,
        prefixBucketCount: 0,
      });
    });

    it('meets repeatable compile, single-field update, and 200-row repeater formula budgets on large enterprise schemas', () => {
      const profiler = new PerformanceProfiler(true);

      const fields = Array.from({ length: 400 }, (_, i) => ({
        name: `metric_${i}`,
        type: 'number' as const,
        defaultValue: i,
      }));

      const largeConfig: FormConfig = {
        id: 'perf-benchmark-400',
        fields: [
          ...fields,
          {
            name: 'rows',
            type: 'repeater',
            fields: [
              { name: 'qty', type: 'number' },
              { name: 'price', type: 'number' },
              {
                name: 'lineTotal',
                type: 'calculated',
                formula: '$item.qty * $item.price',
              },
            ],
          },
          {
            name: 'grandTotal',
            type: 'calculated',
            formula: 'SUM(rows.*.lineTotal)',
          },
        ],
      };

      const plan = profiler.measure('compile', () =>
        compileFormSchema(largeConfig, { bypassCache: true })
      );
      expect(plan.nodeList.length).toBeGreaterThanOrEqual(404);
      expect(profiler.getReport().metrics.compile.lastMs).toBeLessThan(1500);

      const rows = Array.from({ length: 200 }, (_, idx) => ({
        qty: (idx % 5) + 1,
        price: 100,
      }));

      const store = new FormStore({
        config: largeConfig,
        initialValues: { rows },
      });

      // Subscribe 400 listeners like a mounted large form
      const unsubs = fields.map((f) => store.subscribePaths([f.name], () => {}));

      const updateStart = performance.now();
      for (let i = 0; i < 200; i += 1) {
        profiler.measure('propagation', () => {
          store.setValue(`metric_${i}`, i * 2);
        });
      }
      const totalUpdateMs = performance.now() - updateStart;

      expect(store.getSubscriptionDiagnostics().lastNotifyBucketsInspected).toBe(1);
      expect(totalUpdateMs).toBeLessThan(1500);
      expect(store.getValue('grandTotal')).toBe(60000);
      expect(profiler.getReport().metrics.propagation.count).toBe(200);

      for (const u of unsubs) u();
    });
  });

  // =========================================================================
  // P2 — End-to-End Integration: <ExpoForm /> + persistence/ + workflows/
  // =========================================================================
  describe('P2: End-to-End Integration of <ExpoForm />, Persistence & Enterprise Workflows', () => {
    it('integrates vehicle-registration-enterprise.json across <ExpoForm />, StepWorkflowController, DraftManager, OfflineSubmissionQueue, SubmissionLifecycleMachine & ApprovalWorkflowEngine', async () => {
      const enterpriseConfig = vehicleRegistrationJson as unknown as FormConfig;
      const compiledPlan = compileFormSchema(enterpriseConfig);
      const formRef = createRef<ExpoFormRef>();
      const storage = createMemoryStorage();
      const connectivity = new DefaultConnectivityAdapter(false);
      const deliveredSubmissions: FormValues[] = [];

      const drafts = new DraftManager({
        config: enterpriseConfig,
        storageAdapter: storage,
      });
      const stepController = new StepWorkflowController(enterpriseConfig);
      const offlineQueue = new OfflineSubmissionQueue({
        storageAdapter: storage,
        connectivity,
        submitRecord: async (record) => {
          deliveredSubmissions.push(record.values);
          return { ok: true };
        },
      });
      const lifecycle = new SubmissionLifecycleMachine({
        submissionId: 'sub_veh_77441100',
        formId: enterpriseConfig.id,
        initialState: 'draft',
      });
      const approvals = new ApprovalWorkflowEngine({
        lifecycle,
        stages: [
          {
            id: 'excise_inspector',
            title: 'Excise Inspector Review',
            reviewerRoles: ['inspector'],
          },
          {
            id: 'director_signoff',
            title: 'Director Final Sign-off',
            reviewerRoles: ['director'],
          },
        ],
      });

      render(
        <ExpoFormProvider locale="en">
          <ExpoForm
            ref={formRef}
            config={enterpriseConfig}
            initialValues={{
              chassisCode: 'PK-77441100',
              originType: 'local',
              usageCategory: 'private',
              engineCc: 1800,
              ownerTaxPin: '7391',
            }}
            onSubmit={async (values) => {
              lifecycle.transitionTo('in_progress', { actorId: 'applicant_1' });
              lifecycle.transitionTo('ready_for_submission', {
                actorId: 'applicant_1',
              });
              await offlineQueue.enqueue({
                formId: enterpriseConfig.id,
                values,
                sensitivePathsToOmit: compiledPlan.sensitivePaths,
                idempotencyKey: 'idem-veh-77441100',
              });
            }}
          />
        </ExpoFormProvider>
      );

      // Local vehicle skips the "customs-clearance" step ($condition:isImportedVehicle is false)
      const localVisibleSteps = stepController
        .evaluateSteps(formRef.current!.getValues())
        .steps.filter((s) => s.visible && !s.skipped)
        .map((s) => s.id);
      expect(localVisibleSteps).toEqual([
        'vehicle-identity',
        'valuation-and-signoff',
      ]);

      // Save draft and verify secret PIN (ownerTaxPin) is automatically excluded
      await drafts.saveDraft(formRef.current!.getValues(), {
        currentStepIndex: formRef.current!.getState().currentStepIndex,
      });
      const savedDraft = await drafts.loadDraft();
      expect(savedDraft.envelope?.values.chassisCode).toBe('PK-77441100');
      expect(savedDraft.envelope?.values.ownerTaxPin).toBeUndefined();

      // Switch to imported -> customs-clearance step becomes active dynamically
      act(() => {
        formRef.current!.setValue('originType', 'imported');
        formRef.current!.setValue('gdNumber', 'KHI-GD-2026-90012');
        formRef.current!.setValue('invoicePrice', 5000000);
        formRef.current!.setValue(
          'inspectorSignature',
          'data:image/svg+xml;utf8,<svg/>'
        );
        formRef.current!.setValue('confirmDeclaration', true);
      });

      expect(
        stepController
          .evaluateSteps(formRef.current!.getValues())
          .steps.filter((s) => s.visible && !s.skipped)
          .map((s) => s.id)
      ).toContain('customs-clearance');

      // Computed registration tax formula runs automatically
      await waitFor(() => {
        expect(Number(formRef.current!.getValue('totalPayable'))).toBeGreaterThan(
          5000000
        );
      });

      let submitted = false;
      await act(async () => {
        submitted = await formRef.current!.submit();
      });
      expect(submitted).toBe(true);

      // Reconnect online -> offline queue flushes -> transition multi-stage approval workflow
      connectivity.setOnline(true);
      await waitFor(() => {
        expect(deliveredSubmissions).toHaveLength(1);
      });
      expect(deliveredSubmissions[0]?.chassisCode).toBe('PK-77441100');
      expect(deliveredSubmissions[0]?.ownerTaxPin).toBeUndefined();

      approvals.submitForReview({ actorId: 'applicant_1' });
      expect(lifecycle.getState()).toBe('under_review');

      approvals.approve({
        actorId: 'insp-01',
        actorRoles: ['inspector'],
        comment: 'Chassis & GD verified.',
      });
      expect(approvals.getActiveStage()?.config.id).toBe('director_signoff');

      approvals.approve({
        actorId: 'dir-01',
        actorRoles: ['director'],
        comment: 'Approved for registration plate issuance.',
      });
      expect(lifecycle.getState()).toBe('approved');

      offlineQueue.dispose();
      connectivity.dispose();
    });
  });
});
