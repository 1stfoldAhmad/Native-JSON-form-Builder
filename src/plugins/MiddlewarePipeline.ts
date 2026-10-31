import type { FormConfig, FormValues } from '../types';

export type FormLifecycleHookName =
  | 'onSchemaLoaded'
  | 'onFormInit'
  | 'beforeFieldChange'
  | 'afterFieldChange'
  | 'beforeValidate'
  | 'afterValidate'
  | 'beforeStepChange'
  | 'afterStepChange'
  | 'beforeSubmit'
  | 'afterSubmit'
  | 'onSubmitError'
  | 'onDraftSave'
  | 'onDraftRestore'
  | 'onOfflineQueue';

export interface FieldChangeMiddlewarePayload {
  path: string;
  previousValue: unknown;
  nextValue: unknown;
  values: FormValues;
  /** Set `cancel = true` to veto the field change. */
  cancel?: boolean;
}

export interface StepChangeMiddlewarePayload {
  fromStepIndex: number;
  toStepIndex: number;
  values: FormValues;
  cancel?: boolean;
}

export interface SubmitMiddlewarePayload {
  values: FormValues;
  config: FormConfig;
  cancel?: boolean;
  cancelReason?: string;
}

export interface MiddlewarePayloadMap {
  onSchemaLoaded: { config: FormConfig };
  onFormInit: { config: FormConfig; initialValues: FormValues };
  beforeFieldChange: FieldChangeMiddlewarePayload;
  afterFieldChange: { path: string; value: unknown; values: FormValues };
  beforeValidate: { values: FormValues };
  afterValidate: { values: FormValues; valid: boolean; errors: Record<string, string[]> };
  beforeStepChange: StepChangeMiddlewarePayload;
  afterStepChange: { stepIndex: number; values: FormValues };
  beforeSubmit: SubmitMiddlewarePayload;
  afterSubmit: { values: FormValues; result?: unknown };
  onSubmitError: { values: FormValues; error: unknown };
  onDraftSave: { formId: string; values: FormValues };
  onDraftRestore: { formId: string; values: FormValues };
  onOfflineQueue: { queueItemId: string; values: FormValues };
}

export type MiddlewareHandler<K extends FormLifecycleHookName> = (
  payload: MiddlewarePayloadMap[K]
) => Promise<MiddlewarePayloadMap[K] | void> | MiddlewarePayloadMap[K] | void;

export interface MiddlewarePipelineOptions {
  /**
   * When `true` (default), non-veto exceptions thrown inside observer hooks are
   * captured and forwarded to `onMiddlewareError` instead of crashing form UI.
   */
  isolateErrors?: boolean;
  onMiddlewareError?: (hook: FormLifecycleHookName, error: unknown) => void;
}

/**
 * Controlled sequential lifecycle middleware pipeline for `<ExpoForm />` plugins.
 */
export class MiddlewarePipeline {
  private readonly handlers = new Map<
    FormLifecycleHookName,
    Array<{ id: string; fn: MiddlewareHandler<any> }>
  >();

  private readonly isolateErrors: boolean;
  private readonly onMiddlewareError?: (hook: FormLifecycleHookName, error: unknown) => void;

  constructor(options?: MiddlewarePipelineOptions) {
    this.isolateErrors = options?.isolateErrors ?? true;
    this.onMiddlewareError = options?.onMiddlewareError;
  }

  use<K extends FormLifecycleHookName>(
    hook: K,
    fn: MiddlewareHandler<K>,
    id = `mw_${Math.random().toString(36).slice(2, 9)}`
  ): () => void {
    const list = this.handlers.get(hook) ?? [];
    list.push({ id, fn });
    this.handlers.set(hook, list);
    return () => {
      const curr = this.handlers.get(hook);
      if (!curr) return;
      this.handlers.set(
        hook,
        curr.filter((entry) => entry.id !== id)
      );
    };
  }

  removeByPrefix(prefix: string): void {
    for (const [hook, list] of this.handlers.entries()) {
      this.handlers.set(
        hook,
        list.filter((entry) => !entry.id.startsWith(prefix))
      );
    }
  }

  async run<K extends FormLifecycleHookName>(
    hook: K,
    initialPayload: MiddlewarePayloadMap[K]
  ): Promise<MiddlewarePayloadMap[K]> {
    const list = this.handlers.get(hook);
    if (!list || list.length === 0) return initialPayload;

    let current = { ...initialPayload };
    for (const entry of list) {
      try {
        const res = await entry.fn(current);
        if (res && typeof res === 'object') {
          current = res as MiddlewarePayloadMap[K];
        }
        if ((current as { cancel?: boolean }).cancel) {
          break;
        }
      } catch (err) {
        if (!this.isolateErrors) {
          throw err;
        }
        this.onMiddlewareError?.(hook, err);
      }
    }
    return current;
  }
}
