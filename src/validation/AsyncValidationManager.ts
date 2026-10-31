import { evaluateCondition, type ConditionEvaluationContext } from '../conditions/evaluator';
import type {
  AsyncFieldValidationConfig,
  AsyncFieldValidator,
  FieldValidationError,
  FormValues,
} from '../types';
import { getByPath } from '../utils/deepPath';

interface CachedValidationEntry {
  errorMessage: string | null;
  expiresAt: number;
}

export interface AsyncValidationManagerOptions {
  maxCacheEntries?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DEFAULT_MAX_ASYNC_CACHE = 256;

function defaultAbortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Normalizes diverse backend API error payloads (`{ errors: { email: ['Taken'] } }`,
 * `{ fieldErrors, formErrors }`, `{ detail: [{ loc: ['body', 'vin'], msg: 'Invalid' }] }`,
 * RFC 7807 `invalidParams`) into `{ fieldErrors, formErrors }` ready for `FormStore.setServerErrors`.
 */
export function normalizeServerValidationErrors(payload: unknown): {
  fieldErrors: Record<string, string>;
  formErrors: string[];
} {
  const fieldErrors: Record<string, string> = {};
  const formErrors: string[] = [];

  if (!payload) return { fieldErrors, formErrors };
  if (typeof payload === 'string') {
    formErrors.push(payload);
    return { fieldErrors, formErrors };
  }
  if (typeof payload !== 'object') {
    return { fieldErrors, formErrors };
  }

  const obj = payload as Record<string, unknown>;

  const recordFieldErr = (rawPath: string, rawMsg: unknown) => {
    const cleanPath = rawPath.replace(/^body\./, '').replace(/^data\./, '').trim();
    if (!cleanPath) return;
    if (Array.isArray(rawMsg) && rawMsg.length > 0) {
      fieldErrors[cleanPath] = String(rawMsg[0]);
    } else if (typeof rawMsg === 'string' && rawMsg.trim()) {
      fieldErrors[cleanPath] = rawMsg.trim();
    } else if (rawMsg && typeof rawMsg === 'object' && 'message' in rawMsg) {
      fieldErrors[cleanPath] = String((rawMsg as { message: unknown }).message);
    }
  };

  // 1. `{ fieldErrors: { ... }, formErrors: [...] }` or `{ errors: { field: msg | msg[] } }`
  for (const mapKey of ['fieldErrors', 'errors'] as const) {
    const mapCandidate = obj[mapKey];
    if (
      mapCandidate &&
      typeof mapCandidate === 'object' &&
      !Array.isArray(mapCandidate)
    ) {
      for (const [k, v] of Object.entries(mapCandidate as Record<string, unknown>)) {
        recordFieldErr(k, v);
      }
    }
  }

  // 2. Array-style `{ errors: [{ field, message }] }` or FastAPI `{ detail: [{ loc, msg }] }` or RFC 7807 `invalidParams`
  for (const listKey of ['errors', 'detail', 'invalidParams', 'violations'] as const) {
    const listCandidate = obj[listKey];
    if (Array.isArray(listCandidate)) {
      for (const entry of listCandidate) {
        if (typeof entry === 'string') {
          formErrors.push(entry);
          continue;
        }
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as Record<string, unknown>;
        const path =
          typeof item.field === 'string'
            ? item.field
            : typeof item.name === 'string'
              ? item.name
              : typeof item.property === 'string'
                ? item.property
                : Array.isArray(item.loc)
                  ? item.loc.map(String).join('.')
                  : '';
        const msg = item.message ?? item.msg ?? item.reason;
        if (path && msg) {
          recordFieldErr(path, msg);
        } else if (typeof msg === 'string') {
          formErrors.push(msg);
        }
      }
    }
  }

  // 3. Form-level messages (`formErrors`, or top-level `message`/`detail` when no field errors matched or explicit)
  if (Array.isArray(obj.formErrors)) {
    for (const m of obj.formErrors) {
      if (typeof m === 'string' && m.trim()) formErrors.push(m.trim());
    }
  }
  if (typeof obj.detail === 'string' && obj.detail.trim()) {
    formErrors.push(obj.detail.trim());
  } else if (
    typeof obj.message === 'string' &&
    obj.message.trim() &&
    Object.keys(fieldErrors).length === 0
  ) {
    formErrors.push(obj.message.trim());
  }

  return { fieldErrors, formErrors };
}

/**
 * Coordinates multi-rule asynchronous field validation with `dependsOn` cache invalidation,
 * LRU + TTL result caching, in-flight deduplication, `AbortController` cancellation,
 * and configurable retry/backoff on transient network errors.
 */
export class AsyncValidationManager {
  private cache = new Map<string, CachedValidationEntry>();
  private inFlight = new Map<string, Promise<string | null>>();
  private activeAborts = new Map<string, AbortController>();
  private maxCacheEntries: number;
  private now: () => number;
  private sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options?: AsyncValidationManagerOptions) {
    this.maxCacheEntries = options?.maxCacheEntries ?? DEFAULT_MAX_ASYNC_CACHE;
    this.now = options?.now ?? (() => Date.now());
    this.sleep = options?.sleep ?? defaultAbortableSleep;
  }

  public abort(fieldPath?: string): void {
    if (!fieldPath) {
      for (const ctrl of this.activeAborts.values()) ctrl.abort();
      this.activeAborts.clear();
      this.inFlight.clear();
      return;
    }

    for (const [key, ctrl] of this.activeAborts.entries()) {
      if (
        key === fieldPath ||
        key.startsWith(`${fieldPath}.`) ||
        key.startsWith(`${fieldPath}[`) ||
        key.startsWith(`${fieldPath}::`)
      ) {
        ctrl.abort();
        this.activeAborts.delete(key);
      }
    }
  }

  public invalidateField(fieldPath: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${fieldPath}::`) || key.includes(`|dep:${fieldPath}=`)) {
        this.cache.delete(key);
      }
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  private buildCacheKey(
    fieldPath: string,
    rule: AsyncFieldValidationConfig,
    value: unknown,
    values: FormValues
  ): string {
    const depPart = (rule.dependsOn ?? [])
      .map((dep) => `|dep:${dep}=${JSON.stringify(getByPath(values, dep) ?? null)}`)
      .join('');
    return `${fieldPath}::${rule.validatorId}::val=${JSON.stringify(value)}${depPart}`;
  }

  public async evaluateFieldRules(params: {
    fieldPath: string;
    value: unknown;
    values: FormValues;
    rules: readonly AsyncFieldValidationConfig[];
    validators: Record<string, AsyncFieldValidator>;
    locale: string;
    trigger?: 'onBlur' | 'onChange' | 'onSubmit';
    conditionContext?: ConditionEvaluationContext;
    isFieldStale?: (fieldPath: string, validatedValue: unknown) => boolean;
  }): Promise<FieldValidationError[]> {
    const {
      fieldPath,
      value,
      values,
      rules,
      validators,
      locale,
      trigger,
      conditionContext,
      isFieldStale,
    } = params;

    const collectedErrors: FieldValidationError[] = [];

    const tasks = rules.map(async (rule) => {
      if (rule.when && !evaluateCondition(rule.when, values, conditionContext)) {
        return;
      }
      if (
        trigger &&
        trigger !== 'onSubmit' &&
        rule.trigger &&
        rule.trigger !== trigger
      ) {
        return;
      }

      const validator = validators[rule.validatorId];
      if (!validator) return;

      const cacheKey = this.buildCacheKey(fieldPath, rule, value, values);
      const ttlMs = rule.cacheTtlMs ?? 0;

      if (ttlMs > 0) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          if (cached.expiresAt > this.now()) {
            this.cache.delete(cacheKey);
            this.cache.set(cacheKey, cached);
            if (cached.errorMessage) {
              collectedErrors.push({
                field: fieldPath,
                message: cached.errorMessage,
                rule: rule.validatorId,
                source: 'async',
              });
            }
            return;
          }
          this.cache.delete(cacheKey);
        }
      }

      const existingFlight = this.inFlight.get(cacheKey);
      if (existingFlight) {
        const sharedErr = await existingFlight;
        if (!isFieldStale?.(fieldPath, value) && sharedErr) {
          collectedErrors.push({
            field: fieldPath,
            message: sharedErr,
            rule: rule.validatorId,
            source: 'async',
          });
        }
        return;
      }

      const abortKey = `${fieldPath}::${rule.validatorId}`;
      this.activeAborts.get(abortKey)?.abort();
      const controller = new AbortController();
      this.activeAborts.set(abortKey, controller);

      const maxAttempts = Math.max(1, rule.retry?.maxAttempts ?? 1);
      const backoffMs = Math.max(0, rule.retry?.backoffMs ?? 250);

      const flightPromise = (async (): Promise<string | null> => {
        let attempt = 0;
        while (attempt < maxAttempts) {
          attempt += 1;
          try {
            const outcome = await validator({
              field: fieldPath,
              value,
              values,
              params: rule.params,
              locale,
              signal: controller.signal,
            });

            if (controller.signal.aborted || isFieldStale?.(fieldPath, value)) {
              return null;
            }

            const errMsg =
              outcome === false
                ? (rule.message ?? `${fieldPath} failed server validation`)
                : typeof outcome === 'string' && outcome.length > 0
                  ? outcome
                  : null;

            if (ttlMs > 0) {
              if (this.cache.size >= this.maxCacheEntries) {
                const oldest = this.cache.keys().next().value;
                if (oldest !== undefined) this.cache.delete(oldest);
              }
              this.cache.set(cacheKey, {
                errorMessage: errMsg,
                expiresAt: this.now() + ttlMs,
              });
            }

            return errMsg;
          } catch (err) {
            if (controller.signal.aborted || isFieldStale?.(fieldPath, value)) {
              return null;
            }
            if (attempt < maxAttempts) {
              try {
                await this.sleep(backoffMs * attempt, controller.signal);
              } catch {
                return null;
              }
              continue;
            }
            return err instanceof Error
              ? err.message
              : (rule.message ?? 'Validation request failed');
          }
        }
        return null;
      })();

      this.inFlight.set(cacheKey, flightPromise);

      try {
        const errMsg = await flightPromise;
        if (
          !controller.signal.aborted &&
          !isFieldStale?.(fieldPath, value) &&
          errMsg
        ) {
          collectedErrors.push({
            field: fieldPath,
            message: errMsg,
            rule: rule.validatorId,
            source: 'async',
          });
        }
      } finally {
        this.inFlight.delete(cacheKey);
        if (this.activeAborts.get(abortKey) === controller) {
          this.activeAborts.delete(abortKey);
        }
      }
    });

    await Promise.all(tasks);
    return collectedErrors;
  }
}
