import type {
  DraftStorageAdapter,
  FormConfig,
  FormDraftConfig,
  FormValues,
} from '../types';
import {
  collectSensitiveFieldPaths,
  omitSensitiveValues,
} from '../utils/security';
import type { SchemaVersionRegistry } from '../versioning/SchemaVersionRegistry';

export const DRAFT_ENVELOPE_VERSION = 1;

export interface DraftEnvelope {
  readonly __expoFormDraftEnvelope: typeof DRAFT_ENVELOPE_VERSION;
  formId: string;
  schemaVersion: string;
  savedAt: string;
  expiresAt?: string;
  currentStepIndex?: number;
  values: FormValues;
  metadata?: Record<string, unknown>;
}

export interface LoadedDraftResult {
  restored: boolean;
  expired: boolean;
  migrated: boolean;
  envelope?: DraftEnvelope;
  values?: FormValues;
  reason?: string;
}

export interface DraftVersionConflictContext {
  savedVersion: string;
  currentVersion: string;
  values: FormValues;
  envelope: DraftEnvelope;
}

export interface DraftManagerOptions {
  config: FormConfig;
  storageAdapter: DraftStorageAdapter;
  versionRegistry?: SchemaVersionRegistry;
  onVersionConflict?: (
    ctx: DraftVersionConflictContext
  ) => FormValues | null | Promise<FormValues | null>;
  now?: () => Date;
}

function isDraftEnvelope(candidate: unknown): candidate is DraftEnvelope {
  return (
    Boolean(candidate) &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    (candidate as Partial<DraftEnvelope>).__expoFormDraftEnvelope ===
      DRAFT_ENVELOPE_VERSION
  );
}

/**
 * Enterprise Draft Manager handling versioned draft envelopes, expiration policies,
 * schema version migrations, and mandatory sensitive-field exclusion.
 * Completely decoupled from `FormRenderer`.
 */
export class DraftManager {
  private config: FormConfig;
  private storageAdapter: DraftStorageAdapter;
  private versionRegistry?: SchemaVersionRegistry;
  private onVersionConflict?: DraftManagerOptions['onVersionConflict'];
  private now: () => Date;
  private sensitivePaths: Set<string>;
  private builtInSecretPaths: Set<string>;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DraftManagerOptions) {
    this.config = options.config;
    this.storageAdapter = options.storageAdapter;
    this.versionRegistry = options.versionRegistry;
    this.onVersionConflict = options.onVersionConflict;
    this.now = options.now ?? (() => new Date());
    this.sensitivePaths = collectSensitiveFieldPaths(
      this.config,
      this.config.security
    );
    this.builtInSecretPaths = collectSensitiveFieldPaths(
      this.config,
      this.config.security,
      '',
      { builtInSecretsOnly: true }
    );
  }

  public getStorageKey(): string {
    const draftCfg = this.getDraftConfig();
    return draftCfg?.storageKey ?? draftCfg?.key ?? `expo-form-draft:${this.config.id}`;
  }

  private getDraftConfig(): FormDraftConfig | undefined {
    return this.config.draft ?? this.config.persistence;
  }

  private getEffectiveOmissionPaths(): ReadonlySet<string> {
    const draftCfg = this.getDraftConfig();
    // Built-in secrets (password, pin, otp, cvv, etc.) can NEVER opt out of exclusion!
    return draftCfg?.excludeSensitive === false &&
      this.config.security?.protectSensitiveFields === false
      ? this.builtInSecretPaths
      : this.sensitivePaths;
  }

  public sanitizeDraftValues(values: FormValues): FormValues {
    return omitSensitiveValues(values, this.getEffectiveOmissionPaths());
  }

  public async saveDraft(
    values: FormValues,
    extra?: { currentStepIndex?: number; metadata?: Record<string, unknown> }
  ): Promise<DraftEnvelope> {
    const draftCfg = this.getDraftConfig();
    const nowDate = this.now();
    const sanitized = this.sanitizeDraftValues(values);
    const maxAgeMs = draftCfg?.maxAgeMs;

    const envelope: DraftEnvelope = {
      __expoFormDraftEnvelope: DRAFT_ENVELOPE_VERSION,
      formId: this.config.id,
      schemaVersion: this.config.version ?? '1.0.0',
      savedAt: nowDate.toISOString(),
      expiresAt:
        typeof maxAgeMs === 'number' && maxAgeMs > 0
          ? new Date(nowDate.getTime() + maxAgeMs).toISOString()
          : undefined,
      currentStepIndex: extra?.currentStepIndex,
      values: sanitized,
      metadata: extra?.metadata,
    };

    await Promise.resolve(
      this.storageAdapter.setItem(this.getStorageKey(), JSON.stringify(envelope))
    );
    return envelope;
  }

  public async loadDraft(): Promise<LoadedDraftResult> {
    const raw = await Promise.resolve(
      this.storageAdapter.getItem(this.getStorageKey())
    );
    if (!raw) {
      return { restored: false, expired: false, migrated: false };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        restored: false,
        expired: false,
        migrated: false,
        reason: 'Corrupted draft JSON',
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        restored: false,
        expired: false,
        migrated: false,
        reason: 'Invalid draft payload',
      };
    }

    // Backward compatibility with legacy plain `{ field: value }` drafts
    if (!isDraftEnvelope(parsed)) {
      const sanitizedLegacy = this.sanitizeDraftValues(parsed as FormValues);
      return {
        restored: true,
        expired: false,
        migrated: false,
        values: sanitizedLegacy,
      };
    }

    // 1. Check expiration window
    const draftCfg = this.getDraftConfig();
    const nowMs = this.now().getTime();
    const explicitExpiresMs = parsed.expiresAt ? Date.parse(parsed.expiresAt) : NaN;
    const savedMs = Date.parse(parsed.savedAt);
    const computedExpiresMs =
      !Number.isNaN(explicitExpiresMs)
        ? explicitExpiresMs
        : typeof draftCfg?.maxAgeMs === 'number' && !Number.isNaN(savedMs)
          ? savedMs + draftCfg.maxAgeMs
          : NaN;

    if (!Number.isNaN(computedExpiresMs) && nowMs > computedExpiresMs) {
      await this.clearDraft();
      return {
        restored: false,
        expired: true,
        migrated: false,
        envelope: parsed,
        reason: 'Draft expired',
      };
    }

    // 2. Check schema version & run migration or conflict callback when needed
    const currentVersion = this.config.version ?? '1.0.0';
    let workingValues = this.sanitizeDraftValues(parsed.values ?? {});
    let migrated = false;

    if (parsed.schemaVersion !== currentVersion) {
      if (
        this.versionRegistry &&
        this.versionRegistry.canMigrate(
          this.config.id,
          parsed.schemaVersion,
          currentVersion
        )
      ) {
        workingValues = this.sanitizeDraftValues(
          this.versionRegistry.migratePayload(
            this.config.id,
            parsed.schemaVersion,
            currentVersion,
            workingValues
          )
        );
        migrated = true;
      } else if (this.onVersionConflict) {
        const resolved = await this.onVersionConflict({
          savedVersion: parsed.schemaVersion,
          currentVersion,
          values: workingValues,
          envelope: parsed,
        });
        if (!resolved) {
          return {
            restored: false,
            expired: false,
            migrated: false,
            envelope: parsed,
            reason: 'Rejected due to schema version mismatch',
          };
        }
        workingValues = this.sanitizeDraftValues(resolved);
        migrated = true;
      }
    }

    return {
      restored: true,
      expired: false,
      migrated,
      envelope: parsed,
      values: workingValues,
    };
  }

  public async clearDraft(): Promise<void> {
    await Promise.resolve(this.storageAdapter.removeItem(this.getStorageKey()));
  }

  public startIntervalAutosave(
    readSnapshot: () => { values: FormValues; currentStepIndex?: number },
    intervalMs = 15_000
  ): () => void {
    this.stopIntervalAutosave();
    this.intervalTimer = setInterval(() => {
      const snap = readSnapshot();
      void this.saveDraft(snap.values, {
        currentStepIndex: snap.currentStepIndex,
      });
    }, Math.max(1_000, intervalMs));

    return () => this.stopIntervalAutosave();
  }

  public stopIntervalAutosave(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}
