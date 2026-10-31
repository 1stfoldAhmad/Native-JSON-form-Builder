import type {
  DraftStorageAdapter,
  FormFileAsset,
  FormValues,
} from '../types';
import { omitSensitiveValues } from '../utils/security';
import type { ConnectivityAdapter } from './ConnectivityAdapter';

export type QueuedSubmissionStatus =
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'failed_retryable'
  | 'failed_permanent';

export interface QueuedAttachmentEntry {
  fieldPath: string;
  asset: FormFileAsset;
  status: 'pending' | 'uploaded' | 'failed';
  remoteUrl?: string;
  error?: string;
}

export interface QueuedSubmissionRecord {
  id: string;
  idempotencyKey: string;
  formId: string;
  schemaVersion: string;
  values: FormValues;
  attachments: QueuedAttachmentEntry[];
  status: QueuedSubmissionStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SubmissionTransportOutcome {
  ok: boolean;
  permanentFailure?: boolean;
  errorMessage?: string;
  serverData?: unknown;
}

export interface OfflineSubmissionQueueOptions {
  storageAdapter: DraftStorageAdapter;
  storageKey?: string;
  connectivity?: ConnectivityAdapter;
  maxAttempts?: number;
  baseBackoffMs?: number;
  /** Upload an individual local file attachment before final form submission. */
  uploadAttachment?: (
    entry: QueuedAttachmentEntry,
    record: QueuedSubmissionRecord
  ) => Promise<{ remoteUrl: string }>;
  /** Transmit the final submission payload with its `idempotencyKey`. */
  submitRecord: (
    record: QueuedSubmissionRecord
  ) => Promise<SubmissionTransportOutcome>;
  /** Automatically sync queued records whenever connectivity returns online. Defaults to true. */
  autoSyncOnReconnect?: boolean;
  now?: () => Date;
}

function generateIdempotencyKey(prefix = 'sub'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * Durable offline-first submission outbox supporting idempotency keys, staged attachment
 * uploads, exponential backoff retries, conflict/permanent failure isolation, and
 * automatic flush on connectivity recovery.
 */
export class OfflineSubmissionQueue {
  private storageAdapter: DraftStorageAdapter;
  private storageKey: string;
  private connectivity?: ConnectivityAdapter;
  private maxAttempts: number;
  private baseBackoffMs: number;
  private uploadAttachment?: OfflineSubmissionQueueOptions['uploadAttachment'];
  private submitRecord: OfflineSubmissionQueueOptions['submitRecord'];
  private now: () => Date;

  private items: QueuedSubmissionRecord[] = [];
  private loaded = false;
  private syncing = false;
  private listeners = new Set<(items: readonly QueuedSubmissionRecord[]) => void>();
  private unsubscribeConnectivity?: () => void;

  constructor(options: OfflineSubmissionQueueOptions) {
    this.storageAdapter = options.storageAdapter;
    this.storageKey = options.storageKey ?? 'expo-form-offline-outbox:v1';
    this.connectivity = options.connectivity;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.uploadAttachment = options.uploadAttachment;
    this.submitRecord = options.submitRecord;
    this.now = options.now ?? (() => new Date());

    if (this.connectivity && options.autoSyncOnReconnect !== false) {
      this.unsubscribeConnectivity = this.connectivity.subscribe((online) => {
        if (online) {
          void this.syncAll();
        }
      });
    }
  }

  public subscribe(
    listener: (items: readonly QueuedSubmissionRecord[]) => void
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = [...this.items];
    for (const fn of this.listeners) fn(snapshot);
  }

  public async hydrate(): Promise<readonly QueuedSubmissionRecord[]> {
    if (this.loaded) return this.items;
    const raw = await Promise.resolve(this.storageAdapter.getItem(this.storageKey));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.items = parsed as QueuedSubmissionRecord[];
        }
      } catch {
        this.items = [];
      }
    }
    this.loaded = true;
    return this.items;
  }

  private async persist(): Promise<void> {
    await Promise.resolve(
      this.storageAdapter.setItem(this.storageKey, JSON.stringify(this.items))
    );
    this.emit();
  }

  public async enqueue(input: {
    formId: string;
    schemaVersion?: string;
    values: FormValues;
    filesByField?: Record<string, FormFileAsset[]>;
    sensitivePathsToOmit?: ReadonlySet<string>;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<QueuedSubmissionRecord> {
    await this.hydrate();
    const nowIso = this.now().toISOString();
    const id = input.idempotencyKey ?? generateIdempotencyKey(input.formId);

    const sanitizedValues = input.sensitivePathsToOmit
      ? omitSensitiveValues(input.values, input.sensitivePathsToOmit)
      : { ...input.values };

    const attachments: QueuedAttachmentEntry[] = [];
    if (input.filesByField) {
      for (const [fieldPath, assets] of Object.entries(input.filesByField)) {
        for (const asset of assets) {
          attachments.push({
            fieldPath,
            asset,
            status: 'pending',
          });
        }
      }
    }

    // Deduplicate if an identical idempotencyKey is already queued or synced
    const existing = this.items.find((r) => r.idempotencyKey === id);
    if (existing) {
      return existing;
    }

    const record: QueuedSubmissionRecord = {
      id,
      idempotencyKey: id,
      formId: input.formId,
      schemaVersion: input.schemaVersion ?? '1.0.0',
      values: sanitizedValues,
      attachments,
      status: 'queued',
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: nowIso,
      updatedAt: nowIso,
      metadata: input.metadata,
    };

    this.items.push(record);
    await this.persist();

    if (!this.connectivity || this.connectivity.isOnline()) {
      await this.syncAll();
    }

    return record;
  }

  public async getItems(): Promise<readonly QueuedSubmissionRecord[]> {
    await this.hydrate();
    return [...this.items];
  }

  public async removeItem(id: string): Promise<boolean> {
    await this.hydrate();
    const prevLen = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length !== prevLen) {
      await this.persist();
      return true;
    }
    return false;
  }

  public async clearSynced(): Promise<void> {
    await this.hydrate();
    this.items = this.items.filter((item) => item.status !== 'synced');
    await this.persist();
  }

  public async retryItem(id: string): Promise<QueuedSubmissionRecord | null> {
    await this.hydrate();
    const item = this.items.find((r) => r.id === id);
    if (!item) return null;
    item.status = 'queued';
    item.nextRetryAt = undefined;
    item.updatedAt = this.now().toISOString();
    await this.persist();
    await this.syncSingleRecord(item);
    await this.persist();
    return item;
  }

  public async syncAll(): Promise<readonly QueuedSubmissionRecord[]> {
    await this.hydrate();
    if (this.syncing) return [...this.items];
    if (this.connectivity && !this.connectivity.isOnline()) {
      return [...this.items];
    }

    this.syncing = true;
    try {
      const nowMs = this.now().getTime();
      for (const record of this.items) {
        if (
          record.status !== 'queued' &&
          record.status !== 'failed_retryable'
        ) {
          continue;
        }
        if (record.nextRetryAt && Date.parse(record.nextRetryAt) > nowMs) {
          continue;
        }
        await this.syncSingleRecord(record);
      }
      await this.persist();
    } finally {
      this.syncing = false;
    }

    return [...this.items];
  }

  private async syncSingleRecord(record: QueuedSubmissionRecord): Promise<void> {
    record.status = 'syncing';
    record.attempts += 1;
    record.updatedAt = this.now().toISOString();

    try {
      // Stage 1: Upload any pending attachments first so re-attempts don't re-upload completed files
      if (this.uploadAttachment && record.attachments.length > 0) {
        for (const att of record.attachments) {
          if (att.status === 'uploaded') continue;
          const uploaded = await this.uploadAttachment(att, record);
          att.status = 'uploaded';
          att.remoteUrl = uploaded.remoteUrl;
          att.error = undefined;
        }
      }

      // Stage 2: Submit form payload with idempotency key
      const outcome = await this.submitRecord(record);
      if (outcome.ok) {
        record.status = 'synced';
        record.lastError = undefined;
        record.nextRetryAt = undefined;
        record.updatedAt = this.now().toISOString();
        return;
      }

      record.lastError = outcome.errorMessage ?? 'Submission rejected';
      if (outcome.permanentFailure || record.attempts >= record.maxAttempts) {
        record.status = 'failed_permanent';
        record.nextRetryAt = undefined;
      } else {
        record.status = 'failed_retryable';
        const delay = this.baseBackoffMs * 2 ** (record.attempts - 1);
        record.nextRetryAt = new Date(this.now().getTime() + delay).toISOString();
      }
      record.updatedAt = this.now().toISOString();
    } catch (err) {
      record.lastError =
        err instanceof Error ? err.message : 'Network error during submission sync';
      if (record.attempts >= record.maxAttempts) {
        record.status = 'failed_permanent';
        record.nextRetryAt = undefined;
      } else {
        record.status = 'failed_retryable';
        const delay = this.baseBackoffMs * 2 ** (record.attempts - 1);
        record.nextRetryAt = new Date(this.now().getTime() + delay).toISOString();
      }
      record.updatedAt = this.now().toISOString();
    }
  }

  public dispose(): void {
    this.unsubscribeConnectivity?.();
    this.listeners.clear();
  }
}
