import type { FormValues } from '../types';
import { omitSensitiveValues } from '../utils/security';

export interface RemoteDraftSnapshot {
  resumeToken: string;
  formId: string;
  schemaVersion: string;
  currentStepIndex: number;
  values: FormValues;
  updatedAt: string;
  deviceId?: string;
}

export interface RemoteDraftTransport {
  saveRemoteDraft: (
    snapshot: Omit<RemoteDraftSnapshot, 'resumeToken'> & { resumeToken?: string }
  ) => Promise<RemoteDraftSnapshot>;
  fetchRemoteDraft: (resumeToken: string) => Promise<RemoteDraftSnapshot | null>;
  deleteRemoteDraft?: (resumeToken: string) => Promise<void>;
}

export type DraftConflictStrategy =
  | 'newest-wins'
  | 'remote-wins'
  | 'local-wins'
  | ((
      local: RemoteDraftSnapshot,
      remote: RemoteDraftSnapshot
    ) => RemoteDraftSnapshot);

/**
 * Cross-device Save & Resume coordinator synchronizing scrubbed partial progress,
 * active wizard step index, and schema version with a remote backend.
 */
export class RemoteDraftSyncController {
  private transport: RemoteDraftTransport;
  private sensitivePaths: ReadonlySet<string>;
  private conflictStrategy: DraftConflictStrategy;

  constructor(options: {
    transport: RemoteDraftTransport;
    sensitivePaths?: ReadonlySet<string>;
    conflictStrategy?: DraftConflictStrategy;
  }) {
    this.transport = options.transport;
    this.sensitivePaths = options.sensitivePaths ?? new Set();
    this.conflictStrategy = options.conflictStrategy ?? 'newest-wins';
  }

  public async pushDraft(input: {
    resumeToken?: string;
    formId: string;
    schemaVersion: string;
    currentStepIndex: number;
    values: FormValues;
    deviceId?: string;
    updatedAt?: string;
  }): Promise<RemoteDraftSnapshot> {
    const scrubbed = omitSensitiveValues(input.values, this.sensitivePaths);
    return this.transport.saveRemoteDraft({
      resumeToken: input.resumeToken,
      formId: input.formId,
      schemaVersion: input.schemaVersion,
      currentStepIndex: input.currentStepIndex,
      values: scrubbed,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      deviceId: input.deviceId,
    });
  }

  public async pullAndResolveDraft(
    resumeToken: string,
    localDraft?: RemoteDraftSnapshot
  ): Promise<RemoteDraftSnapshot | null> {
    const remote = await this.transport.fetchRemoteDraft(resumeToken);
    if (!remote) return localDraft ?? null;

    const sanitizedRemote: RemoteDraftSnapshot = {
      ...remote,
      values: omitSensitiveValues(remote.values, this.sensitivePaths),
    };

    if (!localDraft) return sanitizedRemote;

    if (typeof this.conflictStrategy === 'function') {
      return this.conflictStrategy(localDraft, sanitizedRemote);
    }
    if (this.conflictStrategy === 'remote-wins') {
      return sanitizedRemote;
    }
    if (this.conflictStrategy === 'local-wins') {
      return localDraft;
    }

    // Default: 'newest-wins'
    const localTs = Date.parse(localDraft.updatedAt);
    const remoteTs = Date.parse(sanitizedRemote.updatedAt);
    if (!Number.isNaN(localTs) && !Number.isNaN(remoteTs) && localTs > remoteTs) {
      return localDraft;
    }
    return sanitizedRemote;
  }

  public async deleteRemoteDraft(resumeToken: string): Promise<void> {
    await this.transport.deleteRemoteDraft?.(resumeToken);
  }
}
